
import uuid
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
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
from payments.workflows import (
    complete_visit_and_generate_invoice,
    get_invoice_payment_summary,
    record_payment_collection,
    reverse_payment,
)
from services.models import Service
from staff.models import StaffProfile
from vehicles.models import Vehicle, VehicleCategory
from visits.models import Visit, VisitService, ServiceAssignment


User = get_user_model()


class VisitInvoiceWorkflowTests(TestCase):
    """
    Integration tests for visit completion, invoice generation,
    payment collection, invoice balances, and payment reversals.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="invoice_admin",
            email="invoice_admin@example.com",
            password="Test-Password-2026!",
            role=User.Role.ADMIN,
        )

        self.branch = Branch.objects.create(
            name="NEV CARWASH",
            code="KIK",
            town="Kikuyu",
        )

        self.category = VehicleCategory.objects.create(
            name="Saloon",
        )

        self.vehicle = Vehicle.objects.create(
            registration_number="KCA123A",
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model="Toyota",
            category=self.category,
            branch=self.branch,
        )

        self.service = Service.objects.create(
            name="Full Car Wash",
            code="FULL-WASH",
            category=Service.Category.CAR_WASH,
            price=Decimal("1000.00"),
            duration_minutes=45,
        )

        self.staff_user = User.objects.create_user(
            username="invoice_cleaner",
            email="invoice_cleaner@example.com",
            password="Test-Password-2026!",
            role=User.Role.CLEANER,
        )

        self.staff_profile = StaffProfile.objects.create(
            user=self.staff_user,
            staff_number="INV-CLN-001",
            branch=self.branch,
            date_joined=date(2026, 1, 1),
        )

        self.visit = Visit.objects.create(
            vehicle=self.vehicle,
            branch=self.branch,
            checked_in_by=self.admin,
        )

        self.visit_service = VisitService.objects.create(
            visit=self.visit,
            service=self.service,
            service_name=self.service.name,
            service_code=self.service.code,
            service_category=self.service.category,
            original_price=Decimal("1000.00"),
            duration_minutes=self.service.duration_minutes,
            requires_timer=self.service.requires_timer,
            added_by=self.admin,
        )

        self.assignment = ServiceAssignment.objects.create(
            visit_service=self.visit_service,
            staff=self.staff_profile,
            assigned_by=self.admin,
        )

    # ---------------------------------------------------------
    # Shared helpers
    # ---------------------------------------------------------

    def create_tax_configuration(self):
        return BranchTaxConfiguration.objects.create(
            branch=self.branch,
            is_vat_registered=False,
            vat_rate=None,
            effective_from=date(2020, 1, 1),
            created_by=self.admin,
        )

    def complete_assignment(self):
        self.assignment.completed_at = timezone.now()
        self.assignment.completed_by = self.staff_user
        self.assignment.save(
            update_fields=[
                "completed_at",
                "completed_by",
            ]
        )

    def complete_visit(self, **kwargs):
        return complete_visit_and_generate_invoice(
            visit_id=self.visit.pk,
            user=self.admin,
            **kwargs,
        )

    def create_issued_invoice(self):
        """
        Create a valid completed visit and its unpaid invoice.
        """
        self.create_tax_configuration()
        self.complete_assignment()

        invoice = self.complete_visit()

        invoice.refresh_from_db()

        self.assertEqual(
            invoice.status,
            Invoice.Status.ISSUED,
        )

        return invoice

    def collect(
        self,
        invoice,
        payments,
        idempotency_key=None,
    ):
        return record_payment_collection(
            invoice_id=invoice.pk,
            user=self.admin,
            payments=payments,
            idempotency_key=idempotency_key or uuid.uuid4(),
        )

    def reverse(
        self,
        payment_entry,
        amount,
        reason="Test reversal",
        idempotency_key=None,
    ):
        return reverse_payment(
            payment_entry_id=payment_entry.pk,
            amount=amount,
            reason=reason,
            user=self.admin,
            idempotency_key=idempotency_key or uuid.uuid4(),
        )

    # ---------------------------------------------------------
    # Existing invoice-generation tests
    # ---------------------------------------------------------

    def test_invoice_is_not_generated_before_visit_completion(self):
        self.assertEqual(
            Invoice.objects.filter(visit=self.visit).count(),
            0,
        )

        self.assertEqual(
            self.visit.status,
            Visit.Status.CHECKED_IN,
        )

        self.assertIsNone(self.visit.completed_at)

    def test_completing_visit_generates_exactly_one_invoice(self):
        self.create_tax_configuration()
        self.complete_assignment()

        invoice = self.complete_visit()

        self.visit.refresh_from_db()

        self.assertEqual(
            self.visit.status,
            Visit.Status.COMPLETED,
        )

        self.assertIsNotNone(self.visit.completed_at)

        self.assertEqual(
            Invoice.objects.filter(visit=self.visit).count(),
            1,
        )

        self.assertEqual(
            invoice.status,
            Invoice.Status.ISSUED,
        )

        self.assertTrue(invoice.invoice_number)

        self.assertEqual(
            invoice.total_amount,
            Decimal("1000.00"),
        )

        self.assertEqual(invoice.lines.count(), 1)

        line = invoice.lines.get()

        self.assertEqual(line.visit_service, self.visit_service)
        self.assertEqual(line.service_name, "Full Car Wash")

    def test_duplicate_completion_cannot_generate_another_invoice(self):
        self.create_tax_configuration()
        self.complete_assignment()

        first_invoice = self.complete_visit()

        with self.assertRaises(ValidationError):
            self.complete_visit()

        self.assertEqual(
            Invoice.objects.filter(visit=self.visit).count(),
            1,
        )

        self.assertTrue(
            Invoice.objects.filter(pk=first_invoice.pk).exists()
        )

        self.assertEqual(
            InvoiceLine.objects.filter(invoice=first_invoice).count(),
            1,
        )

    def test_failed_invoice_generation_leaves_visit_uncompleted(self):
        self.complete_assignment()

        with self.assertRaises(ValidationError):
            self.complete_visit()

        self.visit.refresh_from_db()

        self.assertEqual(
            self.visit.status,
            Visit.Status.CHECKED_IN,
        )

        self.assertIsNone(self.visit.completed_at)

        self.assertEqual(
            Invoice.objects.filter(visit=self.visit).count(),
            0,
        )

        self.assertEqual(InvoiceLine.objects.count(), 0)

    def test_unfinished_staff_assignment_prevents_completion(self):
        self.create_tax_configuration()

        self.assertIsNone(self.assignment.completed_at)
        self.assertIsNone(self.assignment.completed_by_id)

        with self.assertRaises(ValidationError):
            self.complete_visit()

        self.visit.refresh_from_db()

        self.assertEqual(
            self.visit.status,
            Visit.Status.CHECKED_IN,
        )

        self.assertIsNone(self.visit.completed_at)

        self.assertEqual(
            Invoice.objects.filter(visit=self.visit).count(),
            0,
        )

    def test_completion_issues_invoice_without_collecting_payment(self):
        invoice = self.create_issued_invoice()

        self.visit.refresh_from_db()

        self.assertEqual(
            self.visit.status,
            Visit.Status.COMPLETED,
        )

        self.assertEqual(
            invoice.status,
            Invoice.Status.ISSUED,
        )

        self.assertNotEqual(
            invoice.status,
            Invoice.Status.PAID,
        )

        self.assertEqual(
            invoice.total_amount,
            Decimal("1000.00"),
        )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

        self.assertEqual(
            PaymentEntry.objects.filter(
                collection__invoice=invoice
            ).count(),
            0,
        )

    # ---------------------------------------------------------
    # CASH and M-PESA payment collection tests
    # ---------------------------------------------------------

    def test_cash_only_payment_generates_receipt_and_marks_invoice_paid(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [
                {
                    "method": "CASH",
                    "amount": "1000.00",
                },
            ],
        )

        invoice.refresh_from_db()

        self.assertTrue(collection.receipt_number.startswith(
            "RCPT-KIK-"
        ))

        self.assertEqual(collection.entries.count(), 1)

        entry = collection.entries.get()

        self.assertEqual(entry.method, PaymentEntry.Method.CASH)
        self.assertEqual(entry.amount, Decimal("1000.00"))
        self.assertEqual(entry.reference, "")

        self.assertEqual(
            invoice.status,
            Invoice.Status.PAID,
        )

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(
            summary["paid_amount"],
            Decimal("1000.00"),
        )

        self.assertEqual(
            summary["balance"],
            Decimal("0.00"),
        )

    def test_mpesa_only_payment_requires_and_saves_reference(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [
                {
                    "method": "MPESA",
                    "amount": "1000.00",
                    "reference": "QWE1234567",
                },
            ],
        )

        entry = collection.entries.get()

        self.assertEqual(entry.method, PaymentEntry.Method.MPESA)
        self.assertEqual(entry.reference, "QWE1234567")
        self.assertEqual(entry.amount, Decimal("1000.00"))

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.PAID)

    def test_mpesa_payment_without_reference_is_rejected(self):
        invoice = self.create_issued_invoice()

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [
                    {
                        "method": "MPESA",
                        "amount": "1000.00",
                    },
                ],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.ISSUED)

    def test_split_payment_creates_one_receipt_with_multiple_entries(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [
                {
                    "method": "CASH",
                    "amount": "400.00",
                },
                {
                    "method": "MPESA",
                    "amount": "600.00",
                    "reference": "SPLIT12345",
                },
            ],
        )

        invoice.refresh_from_db()

        self.assertEqual(collection.entries.count(), 2)

        self.assertEqual(
            collection.total_received,
            Decimal("1000.00"),
        )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            1,
        )

        self.assertEqual(invoice.status, Invoice.Status.PAID)

        self.assertEqual(
            set(collection.entries.values_list("method", flat=True)),
            {
                PaymentEntry.Method.CASH,
                PaymentEntry.Method.MPESA,
            },
        )

    # ---------------------------------------------------------
    # Partial payments and balance tests
    # ---------------------------------------------------------

    def test_partial_payment_leaves_balance_on_same_invoice(self):
        invoice = self.create_issued_invoice()

        self.collect(
            invoice,
            [
                {
                    "method": "CASH",
                    "amount": "300.00",
                },
            ],
        )

        invoice.refresh_from_db()

        self.assertEqual(
            invoice.status,
            Invoice.Status.PARTIALLY_PAID,
        )

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(
            summary["total_amount"],
            Decimal("1000.00"),
        )

        self.assertEqual(
            summary["paid_amount"],
            Decimal("300.00"),
        )

        self.assertEqual(
            summary["balance"],
            Decimal("700.00"),
        )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            1,
        )

    def test_multiple_collections_can_pay_one_invoice_in_full(self):
        invoice = self.create_issued_invoice()

        self.collect(
            invoice,
            [{"method": "CASH", "amount": "300.00"}],
        )

        self.collect(
            invoice,
            [
                {
                    "method": "MPESA",
                    "amount": "700.00",
                    "reference": "FINAL12345",
                },
            ],
        )

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.PAID)

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            2,
        )

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("1000.00"))
        self.assertEqual(summary["balance"], Decimal("0.00"))

    def test_overpayment_is_rejected_without_creating_collection(self):
        invoice = self.create_issued_invoice()

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [
                    {
                        "method": "CASH",
                        "amount": "1000.01",
                    },
                ],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.ISSUED)

    def test_second_collection_cannot_exceed_remaining_balance(self):
        invoice = self.create_issued_invoice()

        self.collect(
            invoice,
            [{"method": "CASH", "amount": "800.00"}],
        )

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CASH", "amount": "201.00"}],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            1,
        )

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("800.00"))
        self.assertEqual(summary["balance"], Decimal("200.00"))

    def test_zero_or_negative_payment_is_rejected(self):
        invoice = self.create_issued_invoice()

        for amount in ("0.00", "-10.00"):
            with self.subTest(amount=amount):
                with self.assertRaises(ValidationError):
                    self.collect(
                        invoice,
                        [{"method": "CASH", "amount": amount}],
                    )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

    def test_payment_with_more_than_two_decimal_places_is_rejected(self):
        invoice = self.create_issued_invoice()

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CASH", "amount": "100.001"}],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

    # ---------------------------------------------------------
    # Idempotency tests
    # ---------------------------------------------------------

    def test_repeated_payment_request_returns_original_collection(self):
        invoice = self.create_issued_invoice()
        key = uuid.uuid4()

        payment_data = [
            {
                "method": "CASH",
                "amount": "500.00",
            },
        ]

        first = self.collect(
            invoice,
            payment_data,
            idempotency_key=key,
        )

        second = self.collect(
            invoice,
            payment_data,
            idempotency_key=key,
        )

        self.assertEqual(first.pk, second.pk)

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            1,
        )

        self.assertEqual(first.entries.count(), 1)

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("500.00"))

    def test_payment_idempotency_key_cannot_be_reused_for_different_data(self):
        invoice = self.create_issued_invoice()
        key = uuid.uuid4()

        self.collect(
            invoice,
            [{"method": "CASH", "amount": "300.00"}],
            idempotency_key=key,
        )

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CASH", "amount": "400.00"}],
                idempotency_key=key,
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            1,
        )

    # ---------------------------------------------------------
    # Reversal tests
    # ---------------------------------------------------------

    def test_partial_reversal_recalculates_invoice_balance(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "600.00"}],
        )

        payment_entry = collection.entries.get()

        reversal = self.reverse(
            payment_entry,
            "100.00",
            reason="Incorrect cash amount recorded",
        )

        invoice.refresh_from_db()

        self.assertEqual(
            reversal.amount,
            Decimal("100.00"),
        )

        self.assertEqual(
            reversal.reason,
            "Incorrect cash amount recorded",
        )

        self.assertEqual(reversal.reversed_by, self.admin)

        self.assertEqual(invoice.status, Invoice.Status.PARTIALLY_PAID)

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("500.00"))
        self.assertEqual(summary["balance"], Decimal("500.00"))

        self.assertEqual(
            PaymentEntry.objects.filter(
                collection=collection
            ).count(),
            1,
        )

    def test_full_reversal_returns_invoice_to_issued_status(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "1000.00"}],
        )

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)

        payment_entry = collection.entries.get()

        self.reverse(
            payment_entry,
            "1000.00",
            reason="Payment recorded in error",
        )

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.ISSUED)

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("0.00"))
        self.assertEqual(summary["balance"], Decimal("1000.00"))

    def test_multiple_partial_reversals_cannot_exceed_original_payment(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "500.00"}],
        )

        payment_entry = collection.entries.get()

        self.reverse(
            payment_entry,
            "200.00",
            reason="First partial reversal",
        )

        self.reverse(
            payment_entry,
            "200.00",
            reason="Second partial reversal",
        )

        with self.assertRaises(ValidationError):
            self.reverse(
                payment_entry,
                "100.01",
                reason="Exceeds remaining reversible amount",
            )

        self.assertEqual(
            PaymentReversal.objects.filter(
                payment_entry=payment_entry
            ).count(),
            2,
        )

        invoice.refresh_from_db()

        summary = get_invoice_payment_summary(invoice)

        self.assertEqual(summary["paid_amount"], Decimal("100.00"))
        self.assertEqual(summary["balance"], Decimal("900.00"))

    def test_reversal_cannot_exceed_original_payment(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "300.00"}],
        )

        payment_entry = collection.entries.get()

        with self.assertRaises(ValidationError):
            self.reverse(
                payment_entry,
                "300.01",
                reason="Invalid excess reversal",
            )

        self.assertEqual(
            PaymentReversal.objects.filter(
                payment_entry=payment_entry
            ).count(),
            0,
        )

    def test_reversal_requires_reason(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "300.00"}],
        )

        with self.assertRaises(ValidationError):
            self.reverse(
                collection.entries.get(),
                "100.00",
                reason="",
            )

        self.assertEqual(PaymentReversal.objects.count(), 0)

    def test_repeated_reversal_request_returns_original_reversal(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "500.00"}],
        )

        payment_entry = collection.entries.get()
        key = uuid.uuid4()

        first = self.reverse(
            payment_entry,
            "100.00",
            reason="Duplicate request test",
            idempotency_key=key,
        )

        second = self.reverse(
            payment_entry,
            "100.00",
            reason="Duplicate request test",
            idempotency_key=key,
        )

        self.assertEqual(first.pk, second.pk)

        self.assertEqual(
            PaymentReversal.objects.filter(
                payment_entry=payment_entry
            ).count(),
            1,
        )

    def test_reversal_idempotency_key_cannot_be_reused_for_different_data(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [{"method": "CASH", "amount": "500.00"}],
        )

        payment_entry = collection.entries.get()
        key = uuid.uuid4()

        self.reverse(
            payment_entry,
            "100.00",
            reason="Original reversal",
            idempotency_key=key,
        )

        with self.assertRaises(ValidationError):
            self.reverse(
                payment_entry,
                "150.00",
                reason="Different reversal",
                idempotency_key=key,
            )

        self.assertEqual(PaymentReversal.objects.count(), 1)

    # ---------------------------------------------------------
    # Receipt and collection integrity tests
    # ---------------------------------------------------------

    def test_collection_total_received_reflects_reversals(self):
        invoice = self.create_issued_invoice()

        collection = self.collect(
            invoice,
            [
                {"method": "CASH", "amount": "400.00"},
                {
                    "method": "MPESA",
                    "amount": "300.00",
                    "reference": "COLLECTION123",
                },
            ],
        )

        self.assertEqual(
            collection.total_received,
            Decimal("700.00"),
        )

        cash_entry = collection.entries.get(
            method=PaymentEntry.Method.CASH
        )

        self.reverse(
            cash_entry,
            "100.00",
            reason="Cash correction",
        )

        collection.refresh_from_db()

        self.assertEqual(
            collection.total_received,
            Decimal("600.00"),
        )

    def test_different_collections_receive_different_receipt_numbers(self):
        invoice = self.create_issued_invoice()

        first = self.collect(
            invoice,
            [{"method": "CASH", "amount": "200.00"}],
        )

        second = self.collect(
            invoice,
            [{"method": "CASH", "amount": "300.00"}],
        )

        self.assertNotEqual(
            first.receipt_number,
            second.receipt_number,
        )

    def test_invalid_payment_method_is_rejected(self):
        invoice = self.create_issued_invoice()

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CARD", "amount": "100.00"}],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

    def test_void_invoice_cannot_receive_payment(self):
        invoice = self.create_issued_invoice()

        invoice.status = Invoice.Status.VOID
        invoice.save(update_fields=["status", "updated_at"])

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CASH", "amount": "100.00"}],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )

    def test_draft_invoice_cannot_receive_payment(self):
        invoice = self.create_issued_invoice()

        invoice.status = Invoice.Status.DRAFT
        invoice.save(update_fields=["status", "updated_at"])

        with self.assertRaises(ValidationError):
            self.collect(
                invoice,
                [{"method": "CASH", "amount": "100.00"}],
            )

        self.assertEqual(
            PaymentCollection.objects.filter(invoice=invoice).count(),
            0,
        )
