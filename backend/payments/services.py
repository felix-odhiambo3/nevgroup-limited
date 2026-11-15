
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError


ZERO = Decimal("0.00")
CENT = Decimal("0.01")
ONE_HUNDRED = Decimal("100")


def to_decimal(value, field_name="amount"):
    """
    Convert a value to Decimal safely.
    """
    try:
        result = Decimal(str(value))
    except (TypeError, ValueError, ArithmeticError):
        raise ValidationError({
            field_name: "Enter a valid monetary amount."
        })

    if not result.is_finite():
        raise ValidationError({
            field_name: "Enter a valid monetary amount."
        })

    return result


def money(value):
    """
    Round monetary values to two decimal places.
    """
    return to_decimal(value).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def to_cents(value):
    """
    Convert a two-decimal monetary amount to integer cents.
    """
    return int(money(value) * 100)


def from_cents(value):
    """
    Convert integer cents back to Decimal currency.
    """
    return (Decimal(value) / 100).quantize(CENT)


def allocate_discount_proportionally(discount, gross_amounts):
    """
    Allocate an invoice-level bargaining discount proportionally
    across invoice lines.

    The allocation is performed in cents. Any rounding remainder
    is distributed deterministically so that the allocated amounts
    always add up exactly to the requested discount.

    Returns a list of Decimal amounts in the same order as gross_amounts.
    """
    discount = money(discount)
    gross_cents = [to_cents(amount) for amount in gross_amounts]

    if discount < ZERO:
        raise ValidationError({
            "bargaining_discount": "Discount cannot be negative."
        })

    if any(amount < 0 for amount in gross_cents):
        raise ValidationError(
            "Invoice line amounts cannot be negative."
        )

    total_gross_cents = sum(gross_cents)
    discount_cents = to_cents(discount)

    if discount_cents > total_gross_cents:
        raise ValidationError({
            "bargaining_discount": (
                "Bargaining discount cannot exceed the invoice subtotal."
            )
        })

    if discount_cents == 0:
        return [ZERO for _ in gross_cents]

    if total_gross_cents == 0:
        raise ValidationError({
            "bargaining_discount": (
                "A discount cannot be allocated to an invoice with "
                "a zero subtotal."
            )
        })

    allocations = []
    remainders = []

    allocated_cents = 0

    for index, line_gross_cents in enumerate(gross_cents):
        numerator = discount_cents * line_gross_cents

        allocation, remainder = divmod(
            numerator,
            total_gross_cents,
        )

        allocations.append(allocation)
        remainders.append((remainder, index))
        allocated_cents += allocation

    remaining_cents = discount_cents - allocated_cents

    # Give remaining cents to lines with the largest fractional
    # remainders. Index provides deterministic tie-breaking.
    remainders.sort(key=lambda item: (-item[0], item[1]))

    for _, index in remainders[:remaining_cents]:
        allocations[index] += 1

    return [from_cents(value) for value in allocations]


def calculate_invoice_totals(
    visit_services,
    bargaining_discount=ZERO,
    loyalty_discounts=None,
    vat_rate=None,
    zero_price_reasons=None,
):
    """
    Calculate invoice line amounts and invoice totals.

    Arguments:
        visit_services:
            Iterable of VisitService model instances.

        bargaining_discount:
            One bargaining discount applied across the entire
            vehicle invoice.

        loyalty_discounts:
            Optional dictionary mapping VisitService IDs to
            loyalty discount amounts.

        vat_rate:
            VAT percentage, for example Decimal("16.00").
            Use None when the branch is not VAT registered.
            A registered branch with a zero rate must pass Decimal("0.00").

        zero_price_reasons:
            Optional dictionary mapping VisitService IDs to the
            reason/promotion explaining a zero-priced service.

    Returns:
        {
            "lines": [...],
            "totals": {...}
        }

    This function does not create or update database records.
    """

    visit_services = list(visit_services)
    loyalty_discounts = loyalty_discounts or {}
    zero_price_reasons = zero_price_reasons or {}

    if not visit_services:
        raise ValidationError(
            "At least one service is required to calculate an invoice."
        )

    # Validate VAT configuration.
    if vat_rate is not None:
        vat_rate = to_decimal(vat_rate, "vat_rate")

        if vat_rate < ZERO or vat_rate > ONE_HUNDRED:
            raise ValidationError({
                "vat_rate": "VAT rate must be between 0 and 100."
            })

        vat_rate = vat_rate.quantize(CENT)

    gross_amounts = []
    service_ids = []

    for visit_service in visit_services:
        service_id = visit_service.pk

        if service_id is None:
            raise ValidationError(
                "Every service must be saved before invoice calculation."
            )

        original_price = money(visit_service.original_price)

        if original_price < ZERO:
            raise ValidationError(
                "A service price cannot be negative."
            )

        quantity = 1
        gross = money(original_price * quantity)

        gross_amounts.append(gross)
        service_ids.append(service_id)

    # Reject loyalty discounts referring to services outside this invoice.
    unknown_loyalty_ids = set(loyalty_discounts.keys()) - set(service_ids)

    if unknown_loyalty_ids:
        raise ValidationError({
            "loyalty_discounts": (
                "A loyalty discount refers to a service that is "
                "not included in this invoice."
            )
        })

    # Allocate the invoice-wide bargaining discount.
    bargaining_allocations = allocate_discount_proportionally(
        bargaining_discount,
        gross_amounts,
    )

    bargaining_discount = money(bargaining_discount)

    calculated_lines = []

    subtotal = ZERO
    bargaining_total = ZERO
    loyalty_total = ZERO
    taxable_total = ZERO
    vat_total = ZERO
    invoice_total = ZERO
    commission_base_total = ZERO

    for index, visit_service in enumerate(visit_services):
        service_id = service_ids[index]

        gross = gross_amounts[index]
        bargaining = bargaining_allocations[index]

        loyalty = money(
            loyalty_discounts.get(service_id, ZERO)
        )

        if loyalty < ZERO:
            raise ValidationError({
                "loyalty_discounts": (
                    "A loyalty discount cannot be negative."
                )
            })

        remaining_after_bargaining = gross - bargaining

        if loyalty > remaining_after_bargaining:
            raise ValidationError({
                "loyalty_discounts": (
                    f"Loyalty discount for service {service_id} "
                    "cannot exceed the remaining service amount."
                )
            })

        # Loyalty discounts reduce the customer's charge, but do not
        # reduce the cleaner's commission base.
        taxable_amount = money(
            gross - bargaining - loyalty
        )

        commission_base = money(
            gross - bargaining
        )

        if vat_rate is None:
            line_vat_rate = None
            vat_amount = ZERO
        else:
            line_vat_rate = vat_rate
            vat_amount = money(
                taxable_amount * vat_rate / ONE_HUNDRED
            )

        line_total = money(taxable_amount + vat_amount)

        zero_price_reason = (
            zero_price_reasons.get(service_id, "")
        )

        if gross == ZERO and not str(zero_price_reason).strip():
            raise ValidationError({
                "zero_price_reasons": (
                    f"Service {service_id} has a zero price. "
                    "A promotion or zero-price reason is required."
                )
            })

        line = {
            "visit_service": visit_service,
            "service_name": visit_service.service_name,
            "service_code": visit_service.service_code,
            "service_category": visit_service.service_category,
            "quantity": 1,
            "unit_price": money(visit_service.original_price),
            "bargaining_discount": bargaining,
            "loyalty_discount": loyalty,
            "taxable_amount": taxable_amount,
            "vat_rate": line_vat_rate,
            "vat_amount": vat_amount,
            "line_total": line_total,
            "commission_base_amount": commission_base,
            "zero_price_reason": zero_price_reason,
        }

        calculated_lines.append(line)

        subtotal += gross
        bargaining_total += bargaining
        loyalty_total += loyalty
        taxable_total += taxable_amount
        vat_total += vat_amount
        invoice_total += line_total
        commission_base_total += commission_base

    totals = {
        "subtotal": money(subtotal),
        "bargaining_discount_total": money(bargaining_total),
        "loyalty_discount_total": money(loyalty_total),
        "discount_amount": money(
            bargaining_total + loyalty_total
        ),
        "taxable_amount": money(taxable_total),
        "vat_amount": money(vat_total),
        "total_amount": money(invoice_total),
        "commission_base_amount": money(commission_base_total),
    }

    return {
        "lines": calculated_lines,
        "totals": totals,
    }
