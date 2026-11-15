
from collections.abc import Mapping
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from branches.models import Branch
from payments.models import (
    BranchTaxConfiguration,
    Invoice,
    InvoiceLine,
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


def _generate_invoice_number(branch, issue_date):
    """
    Generate a branch-specific, year-specific invoice number.

    The caller must lock the branch row before calling this function.
    That serializes invoice numbering for the same branch.
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

    next_sequence = highest_sequence + 1

    return f"{prefix}{next_sequence:06d}"


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

    The visit is not completed unless invoice generation succeeds.

    Payment collection is deliberately not performed here.
    """

    # Lock the visit so two requests cannot complete it concurrently.
    visit = (
        Visit.objects
        .select_for_update()
        .select_related(
            "vehicle",
            "vehicle__customer",
            "branch",
        )
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

    # Lock the branch row. This serializes invoice number generation
    # for different visits at the same branch.
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

    # Only active, non-removed visit services are invoiced.
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

    # Lock all active assignments belonging to these services.
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

    # Validate the invoice-wide bargaining discount and reason.
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

    customer = visit.vehicle.customer

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

        is_vat_registered=(
            tax_configuration.is_vat_registered
        ),
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

    # Create immutable historical line snapshots.
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

    # Complete the visit only after the invoice and every line
    # have been created successfully.
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
