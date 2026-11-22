
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse

from rest_framework import status
from rest_framework.test import APITestCase

from branches.models import Branch
from vehicles.models import Vehicle, VehicleCategory
from services.models import Service
from staff.models import StaffProfile

from .models import Visit, VisitService, ServiceAssignment


User = get_user_model()


class WorkloadMonitoringTests(APITestCase):

    def setUp(self):
        self.branch = Branch.objects.create(
            name="NEV CARWASH",
            code="NEV-001",
            town="Kikuyu",
        )

        self.other_branch = Branch.objects.create(
            name="Other Branch",
            code="OTHER-001",
            town="Nairobi",
        )

        self.supervisor = User.objects.create_user(
            username="workload_supervisor",
            email="workload_supervisor@example.com",
            password="Test-Password-2026!",
            role=User.Role.SUPERVISOR,
        )

        self.other_supervisor = User.objects.create_user(
            username="other_supervisor",
            email="other_supervisor@example.com",
            password="Test-Password-2026!",
            role=User.Role.SUPERVISOR,
        )

        self.cleaner = User.objects.create_user(
            username="workload_cleaner",
            email="workload_cleaner@example.com",
            password="Test-Password-2026!",
            role=User.Role.CLEANER,
        )

        self.replacement_cleaner = User.objects.create_user(
            username="replacement_cleaner",
            email="replacement_cleaner@example.com",
            password="Test-Password-2026!",
            role=User.Role.CLEANER,
        )

        self.supervisor_profile = StaffProfile.objects.create(
            user=self.supervisor,
            staff_number="W-SUP-001",
            branch=self.branch,
            date_joined=date(2026, 1, 1),
        )

        self.other_supervisor_profile = StaffProfile.objects.create(
            user=self.other_supervisor,
            staff_number="W-SUP-002",
            branch=self.branch,
            date_joined=date(2026, 1, 1),
        )

        self.cleaner_profile = StaffProfile.objects.create(
            user=self.cleaner,
            staff_number="W-CLN-001",
            branch=self.branch,
            date_joined=date(2026, 1, 1),
        )

        self.replacement_cleaner_profile = StaffProfile.objects.create(
            user=self.replacement_cleaner,
            staff_number="W-CLN-002",
            branch=self.branch,
            date_joined=date(2026, 1, 1),
        )

        self.category = VehicleCategory.objects.create(
            name="Saloon",
        )

        self.vehicle = Vehicle.objects.create(
            registration_number="KDA111A",
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model="Toyota",
            category=self.category,
            branch=self.branch,
        )

        self.other_vehicle = Vehicle.objects.create(
            registration_number="KDB222B",
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model="Nissan",
            category=self.category,
            branch=self.other_branch,
        )

        self.service = Service.objects.create(
            name="Full Car Wash",
            code="WORKLOAD-WASH",
            category=Service.Category.CAR_WASH,
            price=Decimal("1000.00"),
            duration_minutes=45,
        )

        self.visit = Visit.objects.create(
            vehicle=self.vehicle,
            branch=self.branch,
            checked_in_by=self.supervisor,
            status=Visit.Status.IN_PROGRESS,
        )

        self.other_visit = Visit.objects.create(
            vehicle=self.other_vehicle,
            branch=self.other_branch,
            checked_in_by=self.supervisor,
        )

        self.visit_service = self.create_visit_service(
            self.visit,
            "Full Car Wash",
        )

        self.unassigned_visit_service = self.create_visit_service(
            self.visit,
            "Second Car Wash",
        )

        self.other_branch_service = self.create_visit_service(
            self.other_visit,
            "Other Branch Car Wash",
        )

        # Legacy fixture: no shift was recorded.
        self.assignment_created_by_other_supervisor = (
            ServiceAssignment.objects.create(
                visit_service=self.visit_service,
                staff=self.cleaner_profile,
                assigned_by=self.other_supervisor,
            )
        )

    def create_visit_service(self, visit, name):
        return VisitService.objects.create(
            visit=visit,
            service=self.service,
            service_name=name,
            service_code=self.service.code,
            service_category=self.service.category,
            original_price=self.service.price,
            duration_minutes=self.service.duration_minutes,
            requires_timer=self.service.requires_timer,
            added_by=self.supervisor,
        )

    def authenticate(self, user=None):
        self.client.force_authenticate(
            user=user or self.supervisor
        )

    def test_supervisor_can_view_other_supervisors_assignment_in_branch(self):
        self.authenticate()

        response = self.client.get(
            reverse("supervisor_monitor_assignments")
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        returned_ids = {
            item["id"]
            for item in response.data["assignments"]
        }

        self.assertIn(
            self.assignment_created_by_other_supervisor.pk,
            returned_ids,
        )

    def test_supervisor_cannot_reassign_another_supervisors_assignment(self):
        self.authenticate()

        response = self.client.post(
            reverse(
                "supervisor_reassign_assignment",
                kwargs={
                    "assignment_id": (
                        self.assignment_created_by_other_supervisor.pk
                    )
                },
            ),
            {
                "new_staff_id": self.replacement_cleaner_profile.pk,
                "reason": "Testing ownership restrictions",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.assignment_created_by_other_supervisor.refresh_from_db()

        self.assertTrue(
            self.assignment_created_by_other_supervisor.is_active
        )

        self.assertEqual(
            ServiceAssignment.objects.count(),
            1,
        )

    def test_supervisor_workload_report_includes_pending_and_unassigned_work(self):
        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report")
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        summary = response.data["summary"]

        self.assertEqual(summary["total_visits"], 1)
        self.assertEqual(summary["active_visits"], 1)
        self.assertEqual(summary["total_services"], 2)
        self.assertEqual(summary["assigned_services"], 1)
        self.assertEqual(summary["unassigned_services"], 1)
        self.assertEqual(summary["active_assignments"], 1)
        self.assertEqual(summary["pending_assignments"], 1)
        self.assertEqual(summary["completed_assignments"], 0)

        self.assertEqual(len(response.data["branches"]), 1)

    def test_workload_report_excludes_other_branches_for_supervisor(self):
        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report")
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        branch_ids = {
            item["branch_id"]
            for item in response.data["branches"]
        }

        self.assertEqual(branch_ids, {self.branch.pk})

        self.assertNotIn(
            self.other_visit.id,
            {
                visit["visit_id"]
                for branch in response.data["branches"]
                for visit in branch["visits"]
            },
        )

    def test_workload_report_counts_explicitly_completed_assignments(self):
        assignment = self.assignment_created_by_other_supervisor

        assignment.completed_at = self.visit.arrival_time
        assignment.completed_by = self.other_supervisor
        assignment.save(
            update_fields=["completed_at", "completed_by"]
        )

        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report")
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        summary = response.data["summary"]

        self.assertEqual(summary["completed_assignments"], 1)
        self.assertEqual(summary["pending_assignments"], 0)

        employee_rows = (
            response.data["branches"][0]["employee_workload"]
        )

        cleaner_row = next(
            row for row in employee_rows
            if row["staff_id"] == self.cleaner_profile.pk
        )

        self.assertEqual(cleaner_row["assigned"], 1)
        self.assertEqual(cleaner_row["completed"], 1)
        self.assertEqual(cleaner_row["pending"], 0)

    def test_not_recorded_filter_returns_legacy_assignments(self):
        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report"),
            {"shift_filter": "NOT_RECORDED"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["shift_filter"],
            "NOT_RECORDED",
        )

        branch_report = response.data["branches"][0]

        self.assertEqual(
            branch_report["summary"]["active_assignments"],
            1,
        )

        self.assertEqual(
            len(branch_report["assignments"]),
            1,
        )

        self.assertIsNone(
            branch_report["assignments"][0]["shift"],
        )

        self.assertEqual(
            branch_report["assignments"][0]["shift_display"],
            "Not recorded",
        )

    def test_day_filter_does_not_change_visit_or_service_allocation_totals(self):
        day_assignment = self.assignment_created_by_other_supervisor
        day_assignment.shift = "DAY"
        day_assignment.save(update_fields=["shift"])

        ServiceAssignment.objects.create(
            visit_service=self.visit_service,
            staff=self.replacement_cleaner_profile,
            assigned_by=self.other_supervisor,
            shift="NIGHT",
        )

        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report"),
            {"shift_filter": "DAY"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(response.data["shift_filter"], "DAY")

        summary = response.data["summary"]

        # Visit and service totals remain independent of shift.
        self.assertEqual(summary["total_visits"], 1)
        self.assertEqual(summary["active_visits"], 1)
        self.assertEqual(summary["total_services"], 2)

        # The service has two active assignments across both shifts.
        # It remains one assigned service under the DAY filter.
        self.assertEqual(summary["assigned_services"], 1)
        self.assertEqual(summary["unassigned_services"], 1)

        # Assignment-level figures are restricted to DAY.
        self.assertEqual(summary["active_assignments"], 1)
        self.assertEqual(summary["pending_assignments"], 1)
        self.assertEqual(summary["completed_assignments"], 0)

        branch_report = response.data["branches"][0]

        self.assertEqual(len(branch_report["assignments"]), 1)
        self.assertEqual(
            branch_report["assignments"][0]["shift"],
            "DAY",
        )

        self.assertEqual(
            branch_report["services"][0]["assigned_employee_count"],
            2,
        )

    def test_night_filter_returns_only_night_assignments(self):
        self.assignment_created_by_other_supervisor.shift = "DAY"
        self.assignment_created_by_other_supervisor.save(
            update_fields=["shift"]
        )

        night_assignment = ServiceAssignment.objects.create(
            visit_service=self.visit_service,
            staff=self.replacement_cleaner_profile,
            assigned_by=self.other_supervisor,
            shift="NIGHT",
        )

        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report"),
            {"shift_filter": "NIGHT"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        branch_report = response.data["branches"][0]

        self.assertEqual(
            branch_report["summary"]["active_assignments"],
            1,
        )

        self.assertEqual(
            len(branch_report["assignments"]),
            1,
        )

        self.assertEqual(
            branch_report["assignments"][0]["id"],
            night_assignment.pk,
        )

        self.assertEqual(
            branch_report["assignments"][0]["shift"],
            "NIGHT",
        )

    def test_invalid_shift_filter_is_rejected(self):
        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report"),
            {"shift_filter": "EVENING"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_assignment_monitoring_supports_shift_filter(self):
        assignment = self.assignment_created_by_other_supervisor
        assignment.shift = "NIGHT"
        assignment.save(update_fields=["shift"])

        self.authenticate()

        response = self.client.get(
            reverse("supervisor_monitor_assignments"),
            {"shift_filter": "NIGHT"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["shift_filter"],
            "NIGHT",
        )

        self.assertEqual(response.data["count"], 1)

        self.assertEqual(
            response.data["assignments"][0]["shift_display"],
            "Night",
        )

    def test_supervisor_reassignment_preserves_original_shift(self):
        original_assignment = ServiceAssignment.objects.get(
            visit_service=self.visit_service,
            staff=self.cleaner_profile,
            is_active=True,
        )
        original_assignment.shift = "NIGHT"
        original_assignment.save(update_fields=["shift"])

        self.authenticate()

        response = self.client.post(
            reverse(
                "supervisor_reassign_assignment",
                kwargs={"assignment_id": original_assignment.pk},
            ),
            {
                "new_staff_id": self.replacement_cleaner_profile.pk,
                "reason": "Employee reassigned for workload balancing",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        original_assignment.refresh_from_db()
        self.assertFalse(original_assignment.is_active)
        self.assertEqual(original_assignment.shift, "NIGHT")

        replacement = ServiceAssignment.objects.get(
            pk=response.data["new_assignment"]["id"],
        )
        self.assertEqual(replacement.staff_id, self.replacement_cleaner_profile.pk)
        self.assertEqual(replacement.shift, "NIGHT")
        self.assertEqual(
            response.data["new_assignment"]["shift_display"],
            "Night",
        )
    def test_invalid_work_date_is_rejected(self):
        self.authenticate()

        response = self.client.get(
            reverse("visit_workload_report"),
            {"work_date": "not-a-date"},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
