
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse

from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from branches.models import Branch
from services.models import Service
from staff.models import StaffProfile
from vehicles.models import Vehicle, VehicleCategory

from .models import Visit, VisitService, ServiceAssignment


User = get_user_model()


class SupervisorMonitorAssignmentTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.branch = Branch.objects.create(
            name='Monitor Test Branch',
            code='MONITOR-KIK',
            town='Kikuyu',
        )

        cls.category = VehicleCategory.objects.create(
            name='Monitor Test Saloon',
        )

        cls.supervisor = User.objects.create_user(
            username='monitor_supervisor',
            email='monitor_supervisor@example.com',
            password='Test-Password-2026!',
            role=User.Role.SUPERVISOR,
        )

        cls.admin = User.objects.create_user(
            username='monitor_admin',
            email='monitor_admin@example.com',
            password='Test-Password-2026!',
            role=User.Role.ADMIN,
        )

        cls.cleaner = User.objects.create_user(
            username='monitor_cleaner',
            email='monitor_cleaner@example.com',
            password='Test-Password-2026!',
            role=User.Role.CLEANER,
        )

        cls.other_cleaner = User.objects.create_user(
            username='monitor_other_cleaner',
            email='monitor_other_cleaner@example.com',
            password='Test-Password-2026!',
            role=User.Role.CLEANER,
        )

        cls.replacement_cleaner = User.objects.create_user(
            username='monitor_replacement_cleaner',
            email='monitor_replacement@example.com',
            password='Test-Password-2026!',
            role=User.Role.CLEANER,
        )

        cls.supervisor_profile = StaffProfile.objects.create(
            user=cls.supervisor,
            staff_number='MONSUP001',
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.cleaner_profile = StaffProfile.objects.create(
            user=cls.cleaner,
            staff_number='MONCLN001',
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.other_cleaner_profile = StaffProfile.objects.create(
            user=cls.other_cleaner,
            staff_number='MONCLN002',
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.replacement_cleaner_profile = StaffProfile.objects.create(
            user=cls.replacement_cleaner,
            staff_number='MONCLN003',
            branch=cls.branch,
            date_joined=date(2026, 1, 1),
        )

        cls.vehicle = Vehicle.objects.create(
            registration_number='MON123A',
            vehicle_type=Vehicle.VehicleType.SALOON,
            make_model='Toyota',
            category=cls.category,
            branch=cls.branch,
        )

        cls.service = Service.objects.create(
            name='Monitor Full Wash',
            code='MONITOR-WASH',
            category=Service.Category.CAR_WASH,
            price=Decimal('1000.00'),
            duration_minutes=45,
        )

        cls.visit = Visit.objects.create(
            vehicle=cls.vehicle,
            branch=cls.branch,
            checked_in_by=cls.supervisor,
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
            added_by=cls.supervisor,
        )

        cls.supervisor_assignment = ServiceAssignment.objects.create(
            visit_service=cls.visit_service,
            staff=cls.cleaner_profile,
            assigned_by=cls.supervisor,
        )

        cls.admin_assignment = ServiceAssignment.objects.create(
            visit_service=cls.visit_service,
            staff=cls.other_cleaner_profile,
            assigned_by=cls.admin,
        )

    def setUp(self):
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_supervisor_sees_only_assignments_they_created(self):
        self.authenticate(self.supervisor)

        response = self.client.get(
            reverse('supervisor_monitor_assignments')
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(response.data['count'], 1)

        assignment_ids = [
            item['id']
            for item in response.data['assignments']
        ]

        self.assertIn(
            self.supervisor_assignment.pk,
            assignment_ids,
        )

        self.assertNotIn(
            self.admin_assignment.pk,
            assignment_ids,
        )

        self.assertEqual(
            response.data['branch_id'],
            self.branch.pk,
        )

    def test_supervisor_can_filter_active_assignments(self):
        self.authenticate(self.supervisor)

        response = self.client.get(
            reverse('supervisor_monitor_assignments'),
            {'status': 'ACTIVE'},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(response.data['count'], 1)

        self.assertEqual(
            response.data['assignments'][0]['id'],
            self.supervisor_assignment.pk,
        )

    def test_supervisor_can_mark_own_assignment_complete(self):
        self.authenticate(self.supervisor)

        response = self.client.post(
            reverse(
                'supervisor_complete_assignment',
                kwargs={
                    'assignment_id': self.supervisor_assignment.pk,
                },
            ),
            {},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.supervisor_assignment.refresh_from_db()

        self.assertIsNotNone(
            self.supervisor_assignment.completed_at,
        )

        self.assertEqual(
            self.supervisor_assignment.completed_by,
            self.supervisor,
        )

    def test_supervisor_can_reassign_employee_with_history_preserved(self):
        self.authenticate(self.supervisor)

        response = self.client.post(
            reverse(
                'supervisor_reassign_assignment',
                kwargs={
                    'assignment_id': self.supervisor_assignment.pk,
                },
            ),
            {
                'new_staff_id': self.replacement_cleaner_profile.pk,
                'reason': 'Original cleaner moved to another vehicle.',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.supervisor_assignment.refresh_from_db()

        self.assertFalse(self.supervisor_assignment.is_active)

        self.assertEqual(
            self.supervisor_assignment.removed_by,
            self.supervisor,
        )

        self.assertIn(
            'Original cleaner moved to another vehicle.',
            self.supervisor_assignment.removal_reason,
        )

        new_assignment = ServiceAssignment.objects.get(
            visit_service=self.visit_service,
            staff=self.replacement_cleaner_profile,
            is_active=True,
        )

        self.assertEqual(
            new_assignment.assigned_by,
            self.supervisor,
        )

        self.assertEqual(
            response.data['new_assignment']['staff'],
            self.replacement_cleaner_profile.pk,
        )

    def test_supervisor_can_remove_own_assignment(self):
        self.authenticate(self.supervisor)

        response = self.client.post(
            reverse(
                'supervisor_remove_assignment',
                kwargs={
                    'assignment_id': self.supervisor_assignment.pk,
                },
            ),
            {
                'reason': 'Vehicle service requirement changed.',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.supervisor_assignment.refresh_from_db()

        self.assertFalse(self.supervisor_assignment.is_active)

        self.assertIsNotNone(
            self.supervisor_assignment.removed_at,
        )

        self.assertEqual(
            self.supervisor_assignment.removed_by,
            self.supervisor,
        )

        self.assertEqual(
            self.supervisor_assignment.removal_reason,
            'Vehicle service requirement changed.',
        )

    def test_completed_assignment_cannot_be_reassigned(self):
        self.supervisor_assignment.completed_at = (
            __import__('django.utils.timezone', fromlist=['now']).now()
        )
        self.supervisor_assignment.completed_by = self.cleaner
        self.supervisor_assignment.save(
            update_fields=[
                'completed_at',
                'completed_by',
            ]
        )

        self.authenticate(self.supervisor)

        response = self.client.post(
            reverse(
                'supervisor_reassign_assignment',
                kwargs={
                    'assignment_id': self.supervisor_assignment.pk,
                },
            ),
            {
                'new_staff_id': self.replacement_cleaner_profile.pk,
                'reason': 'Test reassignment.',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.supervisor_assignment.refresh_from_db()

        self.assertTrue(self.supervisor_assignment.is_active)

    def test_cleaner_cannot_access_supervisor_monitor(self):
        self.authenticate(self.cleaner)

        response = self.client.get(
            reverse('supervisor_monitor_assignments')
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
