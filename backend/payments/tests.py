
from decimal import Decimal
from types import SimpleNamespace

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from payments.services import (
    allocate_discount_proportionally,
    calculate_invoice_totals,
)


def make_visit_service(
    service_id,
    price,
    name="Test Service",
):
    return SimpleNamespace(
        pk=service_id,
        original_price=Decimal(str(price)),
        service_name=name,
        service_code=f"SVC-{service_id}",
        service_category="WASH",
    )


class DiscountAllocationTests(SimpleTestCase):

    def test_discount_is_allocated_proportionally(self):
        allocations = allocate_discount_proportionally(
            Decimal("150.00"),
            [
                Decimal("1000.00"),
                Decimal("500.00"),
            ],
        )

        self.assertEqual(
            allocations,
            [
                Decimal("100.00"),
                Decimal("50.00"),
            ],
        )

    def test_rounding_remainder_is_allocated_exactly(self):
        allocations = allocate_discount_proportionally(
            Decimal("0.01"),
            [
                Decimal("1.00"),
                Decimal("1.00"),
                Decimal("1.00"),
            ],
        )

        self.assertEqual(sum(allocations), Decimal("0.01"))
        self.assertEqual(
            allocations,
            [
                Decimal("0.01"),
                Decimal("0.00"),
                Decimal("0.00"),
            ],
        )

    def test_discount_cannot_exceed_subtotal(self):
        with self.assertRaises(ValidationError):
            allocate_discount_proportionally(
                Decimal("100.01"),
                [Decimal("100.00")],
            )

    def test_negative_discount_is_rejected(self):
        with self.assertRaises(ValidationError):
            allocate_discount_proportionally(
                Decimal("-1.00"),
                [Decimal("100.00")],
            )


class InvoiceCalculationTests(SimpleTestCase):

    def test_bargaining_discount_reduces_commission_base(self):
        service = make_visit_service(1, "1000.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            bargaining_discount=Decimal("100.00"),
        )

        line = result["lines"][0]
        totals = result["totals"]

        self.assertEqual(
            line["bargaining_discount"],
            Decimal("100.00"),
        )
        self.assertEqual(
            line["taxable_amount"],
            Decimal("900.00"),
        )
        self.assertEqual(
            line["commission_base_amount"],
            Decimal("900.00"),
        )
        self.assertEqual(
            totals["total_amount"],
            Decimal("900.00"),
        )

    def test_loyalty_discount_does_not_reduce_commission_base(self):
        service = make_visit_service(1, "1000.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            loyalty_discounts={
                1: Decimal("1000.00"),
            },
        )

        line = result["lines"][0]
        totals = result["totals"]

        self.assertEqual(
            line["loyalty_discount"],
            Decimal("1000.00"),
        )
        self.assertEqual(
            line["taxable_amount"],
            Decimal("0.00"),
        )
        self.assertEqual(
            line["line_total"],
            Decimal("0.00"),
        )
        self.assertEqual(
            line["commission_base_amount"],
            Decimal("1000.00"),
        )
        self.assertEqual(
            totals["commission_base_amount"],
            Decimal("1000.00"),
        )

    def test_bargaining_and_loyalty_discounts_are_separate(self):
        service = make_visit_service(1, "1000.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            bargaining_discount=Decimal("100.00"),
            loyalty_discounts={
                1: Decimal("50.00"),
            },
        )

        line = result["lines"][0]
        totals = result["totals"]

        self.assertEqual(
            line["taxable_amount"],
            Decimal("850.00"),
        )
        self.assertEqual(
            line["commission_base_amount"],
            Decimal("900.00"),
        )
        self.assertEqual(
            totals["bargaining_discount_total"],
            Decimal("100.00"),
        )
        self.assertEqual(
            totals["loyalty_discount_total"],
            Decimal("50.00"),
        )
        self.assertEqual(
            totals["discount_amount"],
            Decimal("150.00"),
        )

    def test_vat_is_calculated_after_discounts(self):
        service = make_visit_service(1, "1000.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            bargaining_discount=Decimal("100.00"),
            loyalty_discounts={
                1: Decimal("50.00"),
            },
            vat_rate=Decimal("16.00"),
        )

        line = result["lines"][0]
        totals = result["totals"]

        self.assertEqual(
            line["taxable_amount"],
            Decimal("850.00"),
        )
        self.assertEqual(
            line["vat_amount"],
            Decimal("136.00"),
        )
        self.assertEqual(
            line["line_total"],
            Decimal("986.00"),
        )
        self.assertEqual(
            totals["total_amount"],
            Decimal("986.00"),
        )

    def test_vat_rounds_to_two_decimal_places(self):
        service = make_visit_service(1, "0.05")

        result = calculate_invoice_totals(
            visit_services=[service],
            vat_rate=Decimal("16.00"),
        )

        self.assertEqual(
            result["lines"][0]["vat_amount"],
            Decimal("0.01"),
        )

    def test_non_vat_registered_invoice_has_no_vat(self):
        service = make_visit_service(1, "1000.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            vat_rate=None,
        )

        line = result["lines"][0]

        self.assertIsNone(line["vat_rate"])
        self.assertEqual(line["vat_amount"], Decimal("0.00"))
        self.assertEqual(line["line_total"], Decimal("1000.00"))

    def test_loyalty_discount_cannot_exceed_remaining_amount(self):
        service = make_visit_service(1, "1000.00")

        with self.assertRaises(ValidationError):
            calculate_invoice_totals(
                visit_services=[service],
                bargaining_discount=Decimal("200.00"),
                loyalty_discounts={
                    1: Decimal("900.00"),
                },
            )

    def test_zero_price_requires_reason(self):
        service = make_visit_service(1, "0.00")

        with self.assertRaises(ValidationError):
            calculate_invoice_totals(
                visit_services=[service],
            )

    def test_zero_price_is_allowed_with_reason(self):
        service = make_visit_service(1, "0.00")

        result = calculate_invoice_totals(
            visit_services=[service],
            zero_price_reasons={
                1: "Approved promotional service",
            },
        )

        self.assertEqual(
            result["totals"]["total_amount"],
            Decimal("0.00"),
        )

    def test_invoice_totals_cover_multiple_services(self):
        services = [
            make_visit_service(1, "1000.00", "Full Wash"),
            make_visit_service(2, "500.00", "Interior Cleaning"),
        ]

        result = calculate_invoice_totals(
            visit_services=services,
            bargaining_discount=Decimal("150.00"),
        )

        totals = result["totals"]

        self.assertEqual(totals["subtotal"], Decimal("1500.00"))
        self.assertEqual(
            totals["bargaining_discount_total"],
            Decimal("150.00"),
        )
        self.assertEqual(
            totals["taxable_amount"],
            Decimal("1350.00"),
        )
        self.assertEqual(
            totals["commission_base_amount"],
            Decimal("1350.00"),
        )
        self.assertEqual(
            totals["total_amount"],
            Decimal("1350.00"),
        )
