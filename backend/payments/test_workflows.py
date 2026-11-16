
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
)
from payments.workflows import complete_visit_and_generate_invoice
from services.models import Service
from staff.models import StaffProfile
from vehicles.models import Vehicle, VehicleCategory
from visits.models import Visit, VisitService, ServiceAssignment


User = get_user_model()


class VisitInvoiceWorkflowTests(TestCase):
    """
    Integration tests for atomic visit completion and invoice generation.

    These tests deliberately do not create payment records:
    completing a visit must issue an unpaid invoice only.
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

    def create_tax_configuration(self):
        """
        Create a non-VAT configuration effective for today's invoice.
        """
        return BranchTaxConfiguration.objects.create(
            branch=self.branch,
            is_vat_registered=False,
            vat_rate=None,
            effective_from=date(2020, 1, 1),
            created_by=self.admin,
        )

    def complete_assignment(self):
        """
        Explicitly confirm the employee's assigned work.
        """
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

        self.assertEqual(
            invoice.lines.count(),
            1,
        )

        line = invoice.lines.get()

        self.assertEqual(
            line.visit_service,
            self.visit_service,
        )

        self.assertEqual(
            line.service_name,
            "Full Car Wash",
        )

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
            InvoiceLine.objects.filter(
                invoice=first_invoice
            ).count(),
            1,
        )

    def test_failed_invoice_generation_leaves_visit_uncompleted(self):
        """
        No effective tax configuration exists.

        Invoice generation must fail and the visit must remain
        checked in because the workflow is atomic.
        """
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

        self.assertEqual(
            InvoiceLine.objects.count(),
            0,
        )

    def test_unfinished_staff_assignment_prevents_completion(self):
        self.create_tax_configuration()

        # The assignment has not been explicitly completed.
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
        self.create_tax_configuration()
        self.complete_assignment()

        invoice = self.complete_visit()

        self.visit.refresh_from_db()
        invoice.refresh_from_db()

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

        # The workflow must not reduce the invoice balance or
        # create payment records as part of visit completion.
        self.assertFalse(
            hasattr(invoice, "payments")
            and invoice.payments.exists()
        )
