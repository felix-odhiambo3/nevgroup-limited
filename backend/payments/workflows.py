
import uuid
from collections.abc import Mapping
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from branches.models import Branch
from payments.models import (
    BranchTaxConfiguration,
    Invoice,
    InvoiceLine,
    PaymentCollection,
    PaymentEntry,
    PaymentReversal,
)
from payments.services import (
    ZERO,
    calculate_invoice_totals,
    money,
    to_decimal,
)
from visits.models import (
    Visit,
    VisitService,
    ServiceAssignment,
)


# ---------------------------------------------------------------------
# Shared validation and calculation helpers
# ---------------------------------------------------------------------

def _normalise_loyalty_discounts(discounts):
    """
    Convert loyalty discounts into a dictionary keyed by
    VisitService primary key.
    """
    if discounts is None:
        return {}

    if not isinstance(discounts, Mapping):
        raise ValidationError({
            "loyalty_discounts": (
                "Provide loyalty discounts as a mapping of "
                "visit service IDs to amounts."
            )
        })

    result = {}

    for service_id, amount in discounts.items():
        try:
            service_id = int(service_id)
        except (TypeError, ValueError):
            raise ValidationError({
                "loyalty_discounts": "Invalid visit service ID."
            })

        if service_id in result:
            raise ValidationError({
                "loyalty_discounts": (
                    "A service cannot have duplicate loyalty discounts."
                )
            })

        result[service_id] = money(
            to_decimal(amount, "loyalty_discounts")
        )

    return result


def _normalise_idempotency_key(value, field_name="idempotency_key"):
    """
    Accept a UUID supplied by the client or generate one.

    Clients should reuse the same UUID when retrying the same request.
    """
    if value in (None, ""):
        return uuid.uuid4()

    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError({
            field_name: "Provide a valid UUID idempotency key."
        })


def _normalise_payment_entries(entries):
    """
    Validate and normalise a collection of payment tender lines.

    Expected format:
    [
        {"method": "CASH", "amount": "500.00"},
        {
            "method": "MPESA",
            "amount": "300.00",
            "reference": "ABC123XYZ",
        },
    ]
    """
    if not isinstance(entries, (list, tuple)) or not entries:
        raise ValidationError({
            "payments": "Provide at least one payment entry."
        })

    normalised = []

    for index, entry in enumerate(entries):
        if not isinstance(entry, Mapping):
            raise ValidationError({
                "payments": f"Payment entry {index + 1} must be an object."
            })

        method = str(entry.get("method", "")).strip().upper()

        if method not in PaymentEntry.Method.values:
            raise ValidationError({
                "payments": (
                    f"Payment entry {index + 1} has an invalid method. "
                    "Use CASH or MPESA."
                )
            })

        try:
            amount_decimal = to_decimal(
                entry.get("amount"),
                "amount",
            )
        except ValidationError as exc:
            raise ValidationError({
                "payments": f"Payment entry {index + 1}: {exc}"
            })

        if amount_decimal <= ZERO:
            raise ValidationError({
                "payments": (
                    f"Payment entry {index + 1} must be greater than zero."
                )
            })

        if amount_decimal.as_tuple().exponent < -2:
            raise ValidationError({
                "payments": (
                    f"Payment entry {index + 1} cannot have more than "
                    "two decimal places."
                )
            })

        amount = money(amount_decimal)
        reference = str(entry.get("reference") or "").strip()

        if method == PaymentEntry.Method.MPESA and not reference:
            raise ValidationError({
                "payments": (
                    f"Payment entry {index + 1} requires an "
                    "M-PESA transaction reference."
                )
            })

        if len(reference) > 100:
            raise ValidationError({
                "payments": (
                    f"Payment entry {index + 1} reference is too long."
                )
            })

        normalised.append({
            "method": method,
            "amount": amount,
            "reference": reference,
        })

    return normalised


def _normalise_reversal_amount(amount):
    try:
        value = to_decimal(amount, "amount")
    except ValidationError:
        raise

    if value <= ZERO:
        raise ValidationError({
            "amount": "Reversal amount must be greater than zero."
        })

    if value.as_tuple().exponent < -2:
        raise ValidationError({
            "amount": (
                "Reversal amount cannot have more than two decimal places."
            )
        })

    return money(value)


def _generate_invoice_number(branch, issue_date):
    """
    Generate a branch-specific, year-specific invoice number.

    The caller must lock the branch row before calling this function.
    """
    prefix = f"{branch.code}-{issue_date.year}-"

    existing_numbers = Invoice.objects.filter(
        branch=branch,
        invoice_number__startswith=prefix,
    ).values_list("invoice_number", flat=True)

    highest_sequence = 0

    for number in existing_numbers:
        try:
            sequence = int(number.rsplit("-", 1)[1])
        except (IndexError, TypeError, ValueError):
            continue

        highest_sequence = max(highest_sequence, sequence)

    return f"{prefix}{highest_sequence + 1:06d}"


def _generate_receipt_number(branch, receipt_date):
    """
    Generate a branch-specific, year-specific receipt number.

    The caller must lock the branch row before calling this function.
    """
    prefix = f"RCPT-{branch.code}-{receipt_date.year}-"

    existing_numbers = PaymentCollection.objects.filter(
        invoice__branch=branch,
        receipt_number__startswith=prefix,
    ).values_list("receipt_number", flat=True)

    highest_sequence = 0

    for number in existing_numbers:
        try:
            sequence = int(number.rsplit("-", 1)[1])
        except (IndexError, TypeError, ValueError):
            continue

        highest_sequence = max(highest_sequence, sequence)

    return f"{prefix}{highest_sequence + 1:06d}"


def _get_effective_tax_configuration(branch, issue_date):
    configuration = (
        BranchTaxConfiguration.objects
        .select_for_update()
        .filter(
            branch=branch,
            effective_from__lte=issue_date,
        )
        .filter(
            Q(effective_until__isnull=True)
            | Q(effective_until__gte=issue_date)
        )
        .order_by("-effective_from")
        .first()
    )

    if configuration is None:
        raise ValidationError({
            "tax_configuration": (
                "No effective tax configuration exists for this "
                "branch on the invoice issue date. Configure the "
                "branch tax settings before completing this visit."
            )
        })

    return configuration


# ---------------------------------------------------------------------
# Invoice payment calculations
# ---------------------------------------------------------------------

def _get_invoice_paid_amount(invoice):
    """
    Calculate net payments received against an invoice.

    Reversals reduce the amount considered paid.
    """
    payments_total = (
        PaymentEntry.objects
        .filter(collection__invoice=invoice)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    reversals_total = (
        PaymentReversal.objects
        .filter(payment_entry__collection__invoice=invoice)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    return money(payments_total - reversals_total)


def _refresh_invoice_payment_status(invoice):
    """
    Recalculate invoice payment status from actual payment entries
    and reversal records.

    This function expects the caller to hold a lock on the invoice.
    """
    paid_amount = _get_invoice_paid_amount(invoice)
    total_amount = money(invoice.total_amount)

    if total_amount <= ZERO:
        new_status = Invoice.Status.ISSUED
    elif paid_amount >= total_amount:
        new_status = Invoice.Status.PAID
    elif paid_amount > ZERO:
        new_status = Invoice.Status.PARTIALLY_PAID
    else:
        new_status = Invoice.Status.ISSUED

    if invoice.status != new_status:
        invoice.status = new_status
        invoice.save(update_fields=["status", "updated_at"])

    return {
        "total_amount": total_amount,
        "paid_amount": paid_amount,
        "balance": money(max(total_amount - paid_amount, ZERO)),
        "status": invoice.status,
    }


def get_invoice_payment_summary(invoice):
    """
    Return the current payment summary for an invoice.

    Accepts either an Invoice instance or its primary key.
    """
    if not isinstance(invoice, Invoice):
        try:
            invoice = Invoice.objects.get(pk=invoice)
        except Invoice.DoesNotExist:
            raise ValidationError({
                "invoice": "The requested invoice does not exist."
            })

    paid_amount = _get_invoice_paid_amount(invoice)
    total_amount = money(invoice.total_amount)

    return {
        "invoice_id": invoice.pk,
        "invoice_number": invoice.invoice_number,
        "total_amount": total_amount,
        "paid_amount": paid_amount,
        "balance": money(max(total_amount - paid_amount, ZERO)),
        "status": invoice.status,
    }


# ---------------------------------------------------------------------
# Visit completion and invoice generation
# ---------------------------------------------------------------------

@transaction.atomic
def complete_visit_and_generate_invoice(
    *,
    visit_id,
    user,
    bargaining_discount=ZERO,
    discount_reason="",
    loyalty_discounts=None,
):
    """
    Complete a visit and issue its invoice atomically.

    Payment collection is deliberately separate.
    """

    visit = (
        Visit.objects
        .select_for_update()
        .filter(pk=visit_id)
        .first()
    )

    if visit is None:
        raise ValidationError({
            "visit": "The requested visit does not exist."
        })

    if visit.status == Visit.Status.CANCELLED:
        raise ValidationError({
            "visit": "A cancelled visit cannot be completed."
        })

    if visit.status == Visit.Status.COMPLETED:
        raise ValidationError({
            "visit": "This visit has already been completed."
        })

    if Invoice.objects.filter(visit=visit).exists():
        raise ValidationError({
            "invoice": (
                "An invoice already exists for this visit. "
                "The visit cannot be completed again."
            )
        })

    branch = (
        Branch.objects
        .select_for_update()
        .get(pk=visit.branch_id)
    )

    issue_datetime = timezone.now()
    issue_date = timezone.localdate(issue_datetime)

    tax_configuration = _get_effective_tax_configuration(
        branch,
        issue_date,
    )

    visit_services = list(
        VisitService.objects
        .select_for_update()
        .filter(
            visit=visit,
            is_removed=False,
        )
        .order_by("id")
    )

    if not visit_services:
        raise ValidationError({
            "services": (
                "A visit must contain at least one active service "
                "before it can be completed."
            )
        })

    service_ids = {service.pk for service in visit_services}

    assignments = list(
        ServiceAssignment.objects
        .select_for_update()
        .filter(
            visit_service_id__in=service_ids,
            is_active=True,
        )
        .order_by("id")
    )

    assignments_by_service = {
        service_id: []
        for service_id in service_ids
    }

    for assignment in assignments:
        assignments_by_service[
            assignment.visit_service_id
        ].append(assignment)

    for service in visit_services:
        service_assignments = assignments_by_service[service.pk]

        if not service_assignments:
            raise ValidationError({
                "assignments": (
                    f"Service '{service.service_name}' has no active "
                    "staff assignment. Assign staff before completing "
                    "the visit."
                )
            })

        for assignment in service_assignments:
            if (
                assignment.completed_at is None
                or assignment.completed_by_id is None
            ):
                raise ValidationError({
                    "assignments": (
                        f"Service '{service.service_name}' still has "
                        "an unfinished staff assignment."
                    )
                })

    bargaining_discount = money(
        to_decimal(
            bargaining_discount,
            "bargaining_discount",
        )
    )

    discount_reason = (discount_reason or "").strip()

    if bargaining_discount < ZERO:
        raise ValidationError({
            "bargaining_discount": (
                "Bargaining discount cannot be negative."
            )
        })

    if bargaining_discount > ZERO and not discount_reason:
        raise ValidationError({
            "discount_reason": (
                "A reason is required when a bargaining discount "
                "is applied."
            )
        })

    loyalty_discounts = _normalise_loyalty_discounts(
        loyalty_discounts
    )

    unknown_ids = set(loyalty_discounts) - service_ids

    if unknown_ids:
        raise ValidationError({
            "loyalty_discounts": (
                "A loyalty discount refers to a service that does "
                "not belong to this visit."
            )
        })

    zero_price_reasons = {
        service.pk: service.zero_price_reason
        for service in visit_services
    }

    vat_rate = (
        tax_configuration.vat_rate
        if tax_configuration.is_vat_registered
        else None
    )

    calculation = calculate_invoice_totals(
        visit_services=visit_services,
        bargaining_discount=bargaining_discount,
        loyalty_discounts=loyalty_discounts,
        vat_rate=vat_rate,
        zero_price_reasons=zero_price_reasons,
    )

    totals = calculation["totals"]

    invoice_number = _generate_invoice_number(
        branch,
        issue_date,
    )

    vehicle = visit.vehicle
    customer = vehicle.customer

    invoice = Invoice(
        visit=visit,
        branch=branch,
        customer=customer,
        invoice_number=invoice_number,
        status=Invoice.Status.ISSUED,

        customer_name=(
            customer.full_name if customer else ""
        ),
        customer_phone=(
            customer.phone_number if customer else ""
        ),

        branch_name=branch.name,
        branch_address=(
            f"{branch.address}, {branch.town}"
            if branch.address
            else branch.town
        ),
        branch_phone=branch.phone,
        branch_tax_registration_number=(
            tax_configuration.tax_registration_number
        ),

        is_vat_registered=tax_configuration.is_vat_registered,
        vat_rate=vat_rate,

        subtotal=totals["subtotal"],
        bargaining_discount_total=(
            totals["bargaining_discount_total"]
        ),
        loyalty_discount_total=(
            totals["loyalty_discount_total"]
        ),
        discount_amount=totals["discount_amount"],
        discount_reason=discount_reason,
        taxable_amount=totals["taxable_amount"],
        vat_amount=totals["vat_amount"],
        total_amount=totals["total_amount"],
        commission_base_amount=(
            totals["commission_base_amount"]
        ),

        created_by=user,
        issued_by=user,
        issued_at=issue_datetime,
    )

    invoice.full_clean()
    invoice.save()

    for line_data in calculation["lines"]:
        InvoiceLine.objects.create(
            invoice=invoice,
            visit_service=line_data["visit_service"],
            service_name=line_data["service_name"],
            service_code=line_data["service_code"],
            service_category=line_data["service_category"],
            quantity=line_data["quantity"],
            unit_price=line_data["unit_price"],
            bargaining_discount=(
                line_data["bargaining_discount"]
            ),
            loyalty_discount=line_data["loyalty_discount"],
            taxable_amount=line_data["taxable_amount"],
            vat_rate=line_data["vat_rate"],
            vat_amount=line_data["vat_amount"],
            line_total=line_data["line_total"],
            commission_base_amount=(
                line_data["commission_base_amount"]
            ),
            zero_price_reason=line_data["zero_price_reason"],
        )

    visit.status = Visit.Status.COMPLETED
    visit.completed_at = issue_datetime
    visit.save(
        update_fields=[
            "status",
            "completed_at",
            "updated_at",
        ]
    )

    return invoice


# ---------------------------------------------------------------------
# Payment collection
# ---------------------------------------------------------------------

@transaction.atomic
def record_payment_collection(
    *,
    invoice_id,
    user,
    payments,
    idempotency_key=None,
):
    """
    Record one payment collection against an issued invoice.

    A collection can contain multiple tender lines, for example
    CASH plus MPESA, and generates one receipt.

    The invoice is locked before balance validation so simultaneous
    collections cannot overpay it.

    Example:

        record_payment_collection(
            invoice_id=12,
            user=request.user,
            payments=[
                {"method": "CASH", "amount": "500.00"},
                {
                    "method": "MPESA",
                    "amount": "300.00",
                    "reference": "ABC123XYZ",
                },
            ],
            idempotency_key="a-valid-client-generated-uuid",
        )
    """

    key = _normalise_idempotency_key(idempotency_key)
    normalised_entries = _normalise_payment_entries(payments)

    # Fast idempotency check for an already completed request.
    existing = (
        PaymentCollection.objects
        .filter(idempotency_key=key)
        .first()
    )

    if existing is not None:
        expected = [
            (item["method"], item["amount"], item["reference"])
            for item in normalised_entries
        ]

        actual = list(
            existing.entries.order_by("id").values_list(
                "method",
                "amount",
                "reference",
            )
        )

        if (
            existing.invoice_id != invoice_id
            or actual != expected
        ):
            raise ValidationError({
                "idempotency_key": (
                    "This idempotency key has already been used "
                    "for a different payment request."
                )
            })

        return existing

    # Lock the invoice to serialize payment collections and reversals.
    invoice = (
        Invoice.objects
        .select_for_update()
        .filter(pk=invoice_id)
        .first()
    )

    if invoice is None:
        raise ValidationError({
            "invoice": "The requested invoice does not exist."
        })

    # Recheck after acquiring the invoice lock.
    existing = (
        PaymentCollection.objects
        .filter(idempotency_key=key)
        .first()
    )

    if existing is not None:
        expected = [
            (item["method"], item["amount"], item["reference"])
            for item in normalised_entries
        ]

        actual = list(
            existing.entries.order_by("id").values_list(
                "method",
                "amount",
                "reference",
            )
        )

        if (
            existing.invoice_id != invoice.pk
            or actual != expected
        ):
            raise ValidationError({
                "idempotency_key": (
                    "This idempotency key has already been used "
                    "for a different payment request."
                )
            })

        return existing

    if invoice.status in (
        Invoice.Status.DRAFT,
        Invoice.Status.VOID,
    ):
        raise ValidationError({
            "invoice": (
                "Payments cannot be collected against a draft "
                "or void invoice."
            )
        })

    if invoice.status == Invoice.Status.CREDIT:
        raise ValidationError({
            "invoice": (
                "This invoice is marked as a credit invoice. "
                "Use the approved credit-account repayment workflow."
            )
        })

    current_paid = _get_invoice_paid_amount(invoice)
    invoice_total = money(invoice.total_amount)
    current_balance = money(invoice_total - current_paid)

    if current_balance <= ZERO:
        raise ValidationError({
            "invoice": "This invoice has no outstanding balance."
        })

    collection_total = money(
        sum(
            (item["amount"] for item in normalised_entries),
            ZERO,
        )
    )

    if collection_total > current_balance:
        raise ValidationError({
            "payments": (
                f"Payment exceeds the outstanding invoice balance. "
                f"Outstanding balance: KES {current_balance}."
            )
        })

    # Lock the branch row to serialize receipt numbering.
    branch = (
        Branch.objects
        .select_for_update()
        .get(pk=invoice.branch_id)
    )

    receipt_datetime = timezone.now()
    receipt_date = timezone.localdate(receipt_datetime)

    receipt_number = _generate_receipt_number(
        branch,
        receipt_date,
    )

    collection = PaymentCollection(
        invoice=invoice,
        receipt_number=receipt_number,
        idempotency_key=key,
        received_by=user,
    )

    collection.full_clean()
    collection.save()

    for item in normalised_entries:
        payment_entry = PaymentEntry(
            collection=collection,
            method=item["method"],
            amount=item["amount"],
            reference=item["reference"],
        )
        payment_entry.full_clean()
        payment_entry.save()

    _refresh_invoice_payment_status(invoice)

    return collection


# ---------------------------------------------------------------------
# Payment reversals
# ---------------------------------------------------------------------

@transaction.atomic
def reverse_payment(
    *,
    payment_entry_id,
    amount,
    reason,
    user,
    idempotency_key=None,
):
    """
    Record a full or partial reversal of an existing payment.

    The original PaymentEntry is never edited or deleted.

    Multiple partial reversals are allowed provided their combined
    amount does not exceed the original payment.

    Reversing a payment recalculates the invoice's outstanding balance
    and payment status.
    """

    key = _normalise_idempotency_key(idempotency_key)
    reversal_amount = _normalise_reversal_amount(amount)
    reason = (reason or "").strip()

    if not reason:
        raise ValidationError({
            "reason": "A reason is required for a payment reversal."
        })

    if len(reason) > 255:
        raise ValidationError({
            "reason": "The reversal reason cannot exceed 255 characters."
        })

    # Idempotency check.
    existing_reversal = (
        PaymentReversal.objects
        .filter(idempotency_key=key)
        .first()
    )

    if existing_reversal is not None:
        if (
            existing_reversal.payment_entry_id != payment_entry_id
            or existing_reversal.amount != reversal_amount
            or existing_reversal.reason != reason
        ):
            raise ValidationError({
                "idempotency_key": (
                    "This idempotency key has already been used "
                    "for a different reversal request."
                )
            })

        return existing_reversal

    # Obtain the invoice ID without locking through a nullable join.
    payment_reference = (
        PaymentEntry.objects
        .filter(pk=payment_entry_id)
        .values(
            "collection__invoice_id",
        )
        .first()
    )

    if payment_reference is None:
        raise ValidationError({
            "payment_entry": "The requested payment does not exist."
        })

    invoice_id = payment_reference["collection__invoice_id"]

    # Lock invoice first. This follows the same lock order as
    # payment collection and prevents concurrent balance changes.
    invoice = (
        Invoice.objects
        .select_for_update()
        .filter(pk=invoice_id)
        .first()
    )

    if invoice is None:
        raise ValidationError({
            "invoice": "The payment's invoice does not exist."
        })

    # Recheck idempotency after obtaining the invoice lock.
    existing_reversal = (
        PaymentReversal.objects
        .filter(idempotency_key=key)
        .first()
    )

    if existing_reversal is not None:
        if (
            existing_reversal.payment_entry_id != payment_entry_id
            or existing_reversal.amount != reversal_amount
            or existing_reversal.reason != reason
        ):
            raise ValidationError({
                "idempotency_key": (
                    "This idempotency key has already been used "
                    "for a different reversal request."
                )
            })

        return existing_reversal

    if invoice.status in (
        Invoice.Status.DRAFT,
        Invoice.Status.VOID,
    ):
        raise ValidationError({
            "invoice": "A payment on this invoice cannot be reversed."
        })

    payment_entry = (
        PaymentEntry.objects
        .select_for_update()
        .filter(
            pk=payment_entry_id,
            collection__invoice=invoice,
        )
        .first()
    )

    if payment_entry is None:
        raise ValidationError({
            "payment_entry": (
                "The requested payment does not belong to this invoice."
            )
        })

    previous_reversals = (
        PaymentReversal.objects
        .filter(payment_entry=payment_entry)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    remaining_reversible = money(
        payment_entry.amount - previous_reversals
    )

    if reversal_amount > remaining_reversible:
        raise ValidationError({
            "amount": (
                "The reversal exceeds the remaining reversible amount. "
                f"Remaining reversible amount: KES {remaining_reversible}."
            )
        })

    reversal = PaymentReversal(
        payment_entry=payment_entry,
        amount=reversal_amount,
        reason=reason,
        reversed_by=user,
        idempotency_key=key,
    )

    reversal.full_clean()
    reversal.save()

    _refresh_invoice_payment_status(invoice)

    return reversal
