
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from branches.models import Branch
from services.models import Service
from staff.models import StaffProfile
from vehicles.models import Vehicle, VehicleCategory

from .models import Visit, VisitService, ServiceAssignment


User = get_user_model()


class MyDayWorkflowTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.branch = Branch.objects.create(
            name="MyDay Kikuyu Branch",
            code="MYDAY-KIK",
            town="Kikuyu",
        )

        cls.category = VehicleCategory.objects.create(
            name="MyDay Saloon",
        )

        cls.admin = User.objects.create_user(
            username="myday_admin",
            email="myday_admin@example.com",
            password="Test-Password-2026!",
            role=User.Role.ADMIN,
        )

        cls.cleaner = User.objects.create_user(
            username="myday_cleaner",
            email="myday_cleaner@example.com",
            password="Test-Password-2026!",
            role=User.Role.CLEANER,
        )

        cls.other_cleaner = User.objects.create_user(
            username="myday_other_cleaner",
            email="myday_other@example.com",
            password="Test-Password-2026!",
            role=User.Role.CLEANER,
        )

        cls.cleaner_profile = StaffProfile.objects.create(
            user=cls.cleaner,
            staff_number="MYCLN001",
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.other_cleaner_profile = StaffProfile.objects.create(
            user=cls.other_cleaner,
            staff_number="MYCLN002",
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.vehicle = Vehicle.objects.create(
            registration_number="MYD123A",
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model="Toyota",
            category=cls.category,
            branch=cls.branch,
        )

        cls.service = Service.objects.create(
            name="MyDay Full Wash",
            code="MYDAY-WASH",
            category=Service.Category.CAR_WASH,
            price=Decimal("1000.00"),
            duration_minutes=45,
        )

        cls.visit = Visit.objects.create(
            vehicle=cls.vehicle,
            branch=cls.branch,
            checked_in_by=cls.admin,
            status=Visit.Status.IN_PROGRESS,
        )

        cls.visit_service = VisitService.objects.create(
            visit=cls.visit,
            service=cls.service,
            service_name=cls.service.name,
            service_code=cls.service.code,
            service_category=cls.service.category,
            original_price=cls.service.price,
            duration_minutes=cls.service.duration_minutes,
            requires_timer=cls.service.requires_timer,
            added_by=cls.admin,
        )

        cls.own_assignment = ServiceAssignment.objects.create(
            visit_service=cls.visit_service,
            staff=cls.cleaner_profile,
            assigned_by=cls.admin,
        )

        cls.other_assignment = ServiceAssignment.objects.create(
            visit_service=cls.visit_service,
            staff=cls.other_cleaner_profile,
            assigned_by=cls.admin,
        )

    def setUp(self):
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_cleaner_can_confirm_own_assignment(self):
        self.authenticate(self.cleaner)

        response = self.client.post(
            reverse(
                "complete_service_assignment",
                kwargs={
                    "assignment_id": self.own_assignment.pk,
                },
            ),
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.own_assignment.refresh_from_db()

        self.assertIsNotNone(
            self.own_assignment.completed_at,
        )

        self.assertEqual(
            self.own_assignment.completed_by,
            self.cleaner,
        )

        self.assertTrue(
            response.data["assignment"]["is_completed"],
        )

    def test_cleaner_cannot_confirm_another_employees_assignment(self):
        self.authenticate(self.cleaner)

        response = self.client.post(
            reverse(
                "complete_service_assignment",
                kwargs={
                    "assignment_id": self.other_assignment.pk,
                },
            ),
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.other_assignment.refresh_from_db()

        self.assertIsNone(
            self.other_assignment.completed_at,
        )

        self.assertIsNone(
            self.other_assignment.completed_by,
        )

    def test_assignment_cannot_be_confirmed_twice(self):
        self.authenticate(self.cleaner)

        url = reverse(
            "complete_service_assignment",
            kwargs={
                "assignment_id": self.own_assignment.pk,
            },
        )

        first_response = self.client.post(
            url,
            {},
            format="json",
        )

        self.assertEqual(
            first_response.status_code,
            status.HTTP_200_OK,
        )

        self.own_assignment.refresh_from_db()
        original_completed_at = self.own_assignment.completed_at

        second_response = self.client.post(
            url,
            {},
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.own_assignment.refresh_from_db()

        self.assertEqual(
            self.own_assignment.completed_at,
            original_completed_at,
        )

    def test_my_day_returns_personal_assignments_and_private_leaderboard(self):
        self.other_assignment.completed_at = timezone.now()
        self.other_assignment.completed_by = self.other_cleaner
        self.other_assignment.save(
            update_fields=[
                "completed_at",
                "completed_by",
            ]
        )

        self.authenticate(self.cleaner)

        response = self.client.get(
            reverse("my_day"),
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["summary"]["assigned_today"],
            1,
        )

        self.assertEqual(
            response.data["summary"]["completed_today"],
            0,
        )

        self.assertEqual(
            response.data["my_rank"],
            2,
        )

        self.assertEqual(
            len(response.data["assignments"]),
            1,
        )

        self.assertEqual(
            response.data["assignments"][0]["id"],
            self.own_assignment.pk,
        )

        leaderboard = response.data["leaderboard"]

        self.assertEqual(len(leaderboard), 2)

        self.assertEqual(
            leaderboard[0]["label"],
            "Cleaner 1",
        )

        self.assertEqual(
            leaderboard[0]["completed_assignments"],
            1,
        )

        self.assertEqual(
            leaderboard[1]["label"],
            "You",
        )

        # Do not expose employee identities in leaderboard entries.
        leaderboard_text = str(leaderboard)

        self.assertNotIn(
            self.other_cleaner.username,
            leaderboard_text,
        )

        self.assertNotIn(
            self.other_cleaner_profile.staff_number,
            leaderboard_text,
        )

        for item in leaderboard:
            self.assertNotIn("id", item)
            self.assertNotIn("username", item)
            self.assertNotIn("staff_number", item)
            self.assertNotIn("name", item)

    def test_non_cleaner_cannot_open_cleaner_my_day(self):
        self.authenticate(self.admin)

        response = self.client.get(
            reverse("my_day"),
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_inactive_assignment_cannot_be_completed(self):
        self.own_assignment.is_active = False
        self.own_assignment.save(update_fields=["is_active"])

        self.authenticate(self.cleaner)

        response = self.client.post(
            reverse(
                "complete_service_assignment",
                kwargs={
                    "assignment_id": self.own_assignment.pk,
                },
            ),
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.own_assignment.refresh_from_db()

        self.assertIsNone(
            self.own_assignment.completed_at,
        )
