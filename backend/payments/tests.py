
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from rest_framework.test import APIClient

from branches.models import Branch
from payments.models import (
    BranchTaxConfiguration,
    Invoice,
    PaymentCollection,
    PaymentEntry,
    PaymentReversal,
)
from payments.services import (
    allocate_discount_proportionally,
    calculate_invoice_totals,
)
from payments.workflows import (
    complete_visit_and_generate_invoice,
)
from services.models import Service
from staff.models import StaffProfile
from vehicles.models import Vehicle, VehicleCategory
from visits.models import Visit, VisitService, ServiceAssignment


User = get_user_model()


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


class PaymentAPITests(TestCase):
    """
    API tests for invoice visibility, branch isolation,
    payment collection, receipts and reversal permissions.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = self.create_user(
            "api_admin",
            User.Role.ADMIN,
        )

        self.owner = self.create_user(
            "api_owner",
            User.Role.OWNER,
        )

        self.accounts_user = self.create_user(
            "api_accounts",
            User.Role.ACCOUNTS,
        )

        self.cleaner_one = self.create_user(
            "api_cleaner_one",
            User.Role.CLEANER,
        )

        self.cleaner_two = self.create_user(
            "api_cleaner_two",
            User.Role.CLEANER,
        )

        self.detailer = self.create_user(
            "api_detailer",
            User.Role.DETAILER,
        )

        self.branch_one = Branch.objects.create(
            name="NEV CARWASH Kikuyu",
            code="API-KIK",
            town="Kikuyu",
        )

        self.branch_two = Branch.objects.create(
            name="NEV CARWASH Branch Two",
            code="API-BR2",
            town="Nairobi",
        )

        self.supervisor_one = self.create_user(
            "api_supervisor_one",
            User.Role.SUPERVISOR,
        )

        self.supervisor_two = self.create_user(
            "api_supervisor_two",
            User.Role.SUPERVISOR,
        )

        self.supervisor_profile_one = StaffProfile.objects.create(
            user=self.supervisor_one,
            staff_number="API-SUP-001",
            branch=self.branch_one,
            date_joined=date(2026, 1, 1),
        )

        self.supervisor_profile_two = StaffProfile.objects.create(
            user=self.supervisor_two,
            staff_number="API-SUP-002",
            branch=self.branch_two,
            date_joined=date(2026, 1, 1),
        )

        self.category = VehicleCategory.objects.create(
            name="API Saloon",
        )

        self.service = Service.objects.create(
            name="API Full Car Wash",
            code="API-FULL-WASH",
            category=Service.Category.CAR_WASH,
            price=Decimal("1000.00"),
            duration_minutes=45,
        )

        self.invoice_one = self.create_issued_invoice(
            branch=self.branch_one,
            registration="KCA111A",
            staff_user=self.cleaner_one,
            staff_number="API-CLN-001",
        )

        self.invoice_two = self.create_issued_invoice(
            branch=self.branch_two,
            registration="KCB222B",
            staff_user=self.cleaner_two,
            staff_number="API-CLN-002",
        )

    def create_user(self, username, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Test-Password-2026!",
            role=role,
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def create_issued_invoice(
        self,
        branch,
        registration,
        staff_user,
        staff_number,
    ):
        tax_configuration = BranchTaxConfiguration.objects.create(
            branch=branch,
            is_vat_registered=False,
            vat_rate=None,
            effective_from=date(2020, 1, 1),
            created_by=self.admin,
        )

        vehicle = Vehicle.objects.create(
            registration_number=registration,
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model="Toyota",
            category=self.category,
            branch=branch,
        )

        staff_profile = StaffProfile.objects.create(
            user=staff_user,
            staff_number=staff_number,
            branch=branch,
            date_joined=date(2026, 1, 1),
        )

        visit = Visit.objects.create(
            vehicle=vehicle,
            branch=branch,
            checked_in_by=self.admin,
        )

        visit_service = VisitService.objects.create(
            visit=visit,
            service=self.service,
            service_name=self.service.name,
            service_code=self.service.code,
            service_category=self.service.category,
            original_price=Decimal("1000.00"),
            duration_minutes=self.service.duration_minutes,
            requires_timer=self.service.requires_timer,
            added_by=self.admin,
        )

        assignment = ServiceAssignment.objects.create(
            visit_service=visit_service,
            staff=staff_profile,
            assigned_by=self.admin,
        )

        assignment.completed_at = timezone.now()
        assignment.completed_by = staff_user
        assignment.save(
            update_fields=[
                "completed_at",
                "completed_by",
            ]
        )

        invoice = complete_visit_and_generate_invoice(
            visit_id=visit.pk,
            user=self.admin,
        )

        invoice.refresh_from_db()

        self.assertEqual(invoice.status, Invoice.Status.ISSUED)

        return invoice

    def collect_payment(self, invoice, amount="300.00"):
        self.authenticate(self.admin)

        response = self.client.post(
            f"/api/payments/invoices/{invoice.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "CASH",
                        "amount": amount,
                    }
                ],
                "idempotency_key": str(uuid.uuid4()),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        return response.data

    # -----------------------------------------------------
    # Invoice access and branch isolation
    # -----------------------------------------------------

    def test_admin_can_list_invoices_across_branches(self):
        self.authenticate(self.admin)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 200)

        invoice_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(self.invoice_one.pk, invoice_ids)
        self.assertIn(self.invoice_two.pk, invoice_ids)

    def test_owner_can_list_invoices_across_branches(self):
        self.authenticate(self.owner)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 200)

        invoice_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(self.invoice_one.pk, invoice_ids)
        self.assertIn(self.invoice_two.pk, invoice_ids)

    def test_accounts_can_list_invoices_across_branches(self):
        self.authenticate(self.accounts_user)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 200)

        invoice_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(self.invoice_one.pk, invoice_ids)
        self.assertIn(self.invoice_two.pk, invoice_ids)

    def test_supervisor_only_sees_own_branch_invoices(self):
        self.authenticate(self.supervisor_one)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 200)

        invoice_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(self.invoice_one.pk, invoice_ids)
        self.assertNotIn(self.invoice_two.pk, invoice_ids)

    def test_supervisor_cannot_retrieve_another_branch_invoice(self):
        self.authenticate(self.supervisor_one)

        response = self.client.get(
            f"/api/payments/invoices/{self.invoice_two.pk}/"
        )

        self.assertEqual(response.status_code, 404)

    def test_supervisor_can_retrieve_own_branch_invoice(self):
        self.authenticate(self.supervisor_one)

        response = self.client.get(
            f"/api/payments/invoices/{self.invoice_one.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.invoice_one.pk)

    def test_cleaner_cannot_access_invoice_api(self):
        self.authenticate(self.cleaner_one)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 403)

    def test_detailer_cannot_access_invoice_api(self):
        self.authenticate(self.detailer)

        response = self.client.get("/api/payments/invoices/")

        self.assertEqual(response.status_code, 403)

    # -----------------------------------------------------
    # Payment collection permissions and behaviour
    # -----------------------------------------------------

    def test_supervisor_can_collect_payment_for_own_branch(self):
        self.authenticate(self.supervisor_one)

        response = self.client.post(
            f"/api/payments/invoices/{self.invoice_one.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "CASH",
                        "amount": "300.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.assertTrue(response.data["receipt_number"])
        self.assertEqual(len(response.data["entries"]), 1)

        self.invoice_one.refresh_from_db()

        self.assertEqual(
            self.invoice_one.status,
            Invoice.Status.PARTIALLY_PAID,
        )

    def test_supervisor_cannot_collect_payment_for_another_branch(self):
        self.authenticate(self.supervisor_one)

        response = self.client.post(
            f"/api/payments/invoices/{self.invoice_two.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "CASH",
                        "amount": "300.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 404)

        self.assertEqual(
            PaymentCollection.objects.filter(
                invoice=self.invoice_two
            ).count(),
            0,
        )

    def test_cleaner_cannot_collect_payment(self):
        self.authenticate(self.cleaner_one)

        response = self.client.post(
            f"/api/payments/invoices/{self.invoice_one.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "CASH",
                        "amount": "300.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

        self.assertEqual(PaymentCollection.objects.count(), 0)

    def test_mpesa_collection_requires_reference_at_api_level(self):
        self.authenticate(self.admin)

        response = self.client.post(
            f"/api/payments/invoices/{self.invoice_one.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "MPESA",
                        "amount": "300.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

        self.assertEqual(PaymentCollection.objects.count(), 0)

    def test_api_supports_split_payment(self):
        self.authenticate(self.admin)

        response = self.client.post(
            f"/api/payments/invoices/{self.invoice_one.pk}/collections/",
            {
                "payments": [
                    {
                        "method": "CASH",
                        "amount": "400.00",
                    },
                    {
                        "method": "MPESA",
                        "amount": "600.00",
                        "reference": "API-SPLIT-123",
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.assertEqual(len(response.data["entries"]), 2)
        self.assertEqual(
            response.data["total_received"],
            "1000.00",
        )

        self.invoice_one.refresh_from_db()

        self.assertEqual(
            self.invoice_one.status,
            Invoice.Status.PAID,
        )

    # -----------------------------------------------------
    # Receipt access and branch isolation
    # -----------------------------------------------------

    def test_supervisor_can_list_own_branch_receipts(self):
        self.collect_payment(self.invoice_one)

        self.authenticate(self.supervisor_one)

        response = self.client.get("/api/payments/collections/")

        self.assertEqual(response.status_code, 200)

        self.assertTrue(
            all(
                item["invoice"] == self.invoice_one.pk
                for item in response.data
            )
        )

    def test_supervisor_cannot_view_another_branch_receipt(self):
        collection_data = self.collect_payment(self.invoice_two)

        self.authenticate(self.supervisor_one)

        response = self.client.get(
            f"/api/payments/collections/{collection_data['id']}/"
        )

        self.assertEqual(response.status_code, 404)

    def test_supervisor_can_view_own_branch_receipt(self):
        collection_data = self.collect_payment(self.invoice_one)

        self.authenticate(self.supervisor_one)

        response = self.client.get(
            f"/api/payments/collections/{collection_data['id']}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["receipt_number"],
            collection_data["receipt_number"],
        )

    def test_receipt_contains_invoice_and_payment_details(self):
        collection_data = self.collect_payment(self.invoice_one)

        self.authenticate(self.admin)

        response = self.client.get(
            f"/api/payments/collections/{collection_data['id']}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["invoice"],
            self.invoice_one.pk,
        )
        self.assertEqual(
            response.data["invoice_total"],
            "1000.00",
        )
        self.assertEqual(len(response.data["entries"]), 1)

    # -----------------------------------------------------
    # Payment reversal permissions
    # -----------------------------------------------------

    def test_supervisor_cannot_reverse_payment(self):
        collection_data = self.collect_payment(self.invoice_one)
        payment_entry_id = collection_data["entries"][0]["id"]

        self.authenticate(self.supervisor_one)

        response = self.client.post(
            f"/api/payments/entries/{payment_entry_id}/reversals/",
            {
                "amount": "100.00",
                "reason": "Test reversal",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(PaymentReversal.objects.count(), 0)

    def test_cleaner_cannot_reverse_payment(self):
        collection_data = self.collect_payment(self.invoice_one)
        payment_entry_id = collection_data["entries"][0]["id"]

        self.authenticate(self.cleaner_one)

        response = self.client.post(
            f"/api/payments/entries/{payment_entry_id}/reversals/",
            {
                "amount": "100.00",
                "reason": "Test reversal",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(PaymentReversal.objects.count(), 0)

    def test_admin_can_reverse_payment(self):
        collection_data = self.collect_payment(self.invoice_one)
        payment_entry_id = collection_data["entries"][0]["id"]

        self.authenticate(self.admin)

        response = self.client.post(
            f"/api/payments/entries/{payment_entry_id}/reversals/",
            {
                "amount": "100.00",
                "reason": "Incorrect amount recorded",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.assertEqual(
            response.data["amount"],
            "100.00",
        )

        self.assertEqual(
            response.data["reason"],
            "Incorrect amount recorded",
        )

    def test_owner_can_view_reversal_history(self):
        self.authenticate(self.owner)

        response = self.client.get("/api/payments/reversals/")

        self.assertEqual(response.status_code, 200)

    def test_accounts_can_view_reversal_history(self):
        self.authenticate(self.accounts_user)

        response = self.client.get("/api/payments/reversals/")

        self.assertEqual(response.status_code, 200)

    def test_supervisor_cannot_view_reversal_history(self):
        self.authenticate(self.supervisor_one)

        response = self.client.get("/api/payments/reversals/")

        self.assertEqual(response.status_code, 403)
