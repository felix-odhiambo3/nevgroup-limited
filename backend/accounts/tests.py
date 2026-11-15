from django.contrib.auth import get_user_model
from django.urls import reverse

from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from .models import UserRoleHistory


User = get_user_model()


class UserManagementSecurityTests(APITestCase):

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='test_admin',
            email='admin@example.com',
            password='Admin-Test-Password-2026!',
            role=User.Role.ADMIN,
        )

        self.owner = User.objects.create_user(
            username='test_owner',
            email='owner@example.com',
            password='Owner-Test-Password-2026!',
            role=User.Role.OWNER,
        )

        self.cleaner = User.objects.create_user(
            username='test_cleaner',
            email='cleaner@example.com',
            password='Cleaner-Test-Password-2026!',
            role=User.Role.CLEANER,
        )

        self.admin_url = reverse('user_list_create')

        self.owner_detail_url = reverse(
            'user_detail',
            kwargs={'pk': self.owner.pk}
        )

        self.admin_detail_url = reverse(
            'user_detail',
            kwargs={'pk': self.admin.pk}
        )

        self.cleaner_detail_url = reverse(
            'user_detail',
            kwargs={'pk': self.cleaner.pk}
        )

        self.owner_deactivate_url = reverse(
            'user_deactivate',
            kwargs={'pk': self.owner.pk}
        )

        self.cleaner_role_history_url = reverse(
            'user_role_history',
            kwargs={'pk': self.cleaner.pk}
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_admin_can_create_ordinary_staff(self):
        self.authenticate(self.admin)

        response = self.client.post(
            self.admin_url,
            {
                'username': 'new_supervisor',
                'email': 'supervisor@example.com',
                'first_name': 'New',
                'last_name': 'Supervisor',
                'password': 'New-Supervisor-Password-2026!',
                'role': User.Role.SUPERVISOR,
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED
        )

        created_user = User.objects.get(
            username='new_supervisor'
        )

        self.assertEqual(
            created_user.role,
            User.Role.SUPERVISOR
        )

    def test_admin_cannot_create_owner(self):
        self.authenticate(self.admin)

        response = self.client.post(
            self.admin_url,
            {
                'username': 'unauthorized_owner',
                'email': 'unauthorized@example.com',
                'password': 'Unauthorized-Owner-Password-2026!',
                'role': User.Role.OWNER,
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST
        )

        self.assertFalse(
            User.objects.filter(
                username='unauthorized_owner'
            ).exists()
        )

    def test_admin_cannot_promote_themselves_to_owner(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.admin_detail_url,
            {
                'role': User.Role.OWNER,
                'role_change_reason': 'Unauthorized promotion attempt.',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST
        )

        self.admin.refresh_from_db()

        self.assertEqual(
            self.admin.role,
            User.Role.ADMIN
        )

        self.assertFalse(
            UserRoleHistory.objects.filter(
                user=self.admin
            ).exists()
        )

    def test_admin_cannot_retrieve_owner_account(self):
        self.authenticate(self.admin)

        response = self.client.get(self.owner_detail_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND
        )

    def test_admin_cannot_modify_owner_account(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.owner_detail_url,
            {
                'first_name': 'Changed',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND
        )

        self.owner.refresh_from_db()

        self.assertNotEqual(
            self.owner.first_name,
            'Changed'
        )

    def test_admin_cannot_deactivate_owner(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.owner_deactivate_url
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND
        )

        self.owner.refresh_from_db()

        self.assertTrue(self.owner.is_active)

    def test_admin_user_list_does_not_include_owner(self):
        self.authenticate(self.admin)

        response = self.client.get(self.admin_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        returned_ids = [
            item['id'] for item in response.data
        ]

        self.assertNotIn(
            self.owner.id,
            returned_ids
        )

    def test_owner_can_create_another_owner(self):
        self.authenticate(self.owner)

        response = self.client.post(
            self.admin_url,
            {
                'username': 'second_owner',
                'email': 'secondowner@example.com',
                'password': 'Second-Owner-Password-2026!',
                'role': User.Role.OWNER,
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED
        )

        second_owner = User.objects.get(
            username='second_owner'
        )

        self.assertEqual(
            second_owner.role,
            User.Role.OWNER
        )

    def test_owner_can_modify_another_owner(self):
        self.authenticate(self.owner)

        another_owner = User.objects.create_user(
            username='another_owner',
            email='anotherowner@example.com',
            password='Another-Owner-Password-2026!',
            role=User.Role.OWNER,
        )

        url = reverse(
            'user_detail',
            kwargs={'pk': another_owner.pk}
        )

        response = self.client.patch(
            url,
            {
                'first_name': 'Authorized',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        another_owner.refresh_from_db()

        self.assertEqual(
            another_owner.first_name,
            'Authorized'
        )

    def test_owner_can_deactivate_another_owner(self):
        self.authenticate(self.owner)

        another_owner = User.objects.create_user(
            username='owner_to_deactivate',
            email='ownerdeactivate@example.com',
            password='Owner-Deactivation-Password-2026!',
            role=User.Role.OWNER,
        )

        url = reverse(
            'user_deactivate',
            kwargs={'pk': another_owner.pk}
        )

        response = self.client.patch(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        another_owner.refresh_from_db()

        self.assertFalse(another_owner.is_active)

    def test_user_cannot_deactivate_their_own_account(self):
        self.authenticate(self.admin)

        url = reverse(
            'user_deactivate',
            kwargs={'pk': self.admin.pk}
        )

        response = self.client.patch(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST
        )

        self.admin.refresh_from_db()

        self.assertTrue(self.admin.is_active)

    def test_unauthenticated_user_cannot_manage_accounts(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.admin_url)

        self.assertIn(
            response.status_code,
            [
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
            ]
        )

    def test_admin_can_change_staff_role_with_reason(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.cleaner_detail_url,
            {
                'role': User.Role.DETAILER,
                'role_change_reason': 'Employee reassigned to detailing duties.',
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        self.cleaner.refresh_from_db()

        self.assertEqual(
            self.cleaner.role,
            User.Role.DETAILER
        )

        history = UserRoleHistory.objects.get(
            user=self.cleaner
        )

        self.assertEqual(
            history.previous_role,
            User.Role.CLEANER
        )

        self.assertEqual(
            history.new_role,
            User.Role.DETAILER
        )

        self.assertEqual(
            history.changed_by,
            self.admin
        )

        self.assertEqual(
            history.reason,
            'Employee reassigned to detailing duties.'
        )

    def test_role_change_without_reason_is_rejected(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.cleaner_detail_url,
            {
                'role': User.Role.DETAILER,
            },
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST
        )

        self.cleaner.refresh_from_db()

        self.assertEqual(
            self.cleaner.role,
            User.Role.CLEANER
        )

        self.assertFalse(
            UserRoleHistory.objects.filter(
                user=self.cleaner
            ).exists()
        )

    def test_role_history_is_available_to_admin(self):
        self.authenticate(self.admin)

        self.client.patch(
            self.cleaner_detail_url,
            {
                'role': User.Role.DETAILER,
                'role_change_reason': 'Role history test.',
            },
            format='json',
        )

        response = self.client.get(
            self.cleaner_role_history_url
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK
        )

        self.assertEqual(len(response.data), 1)

        self.assertEqual(
            response.data[0]['previous_role'],
            User.Role.CLEANER
        )

        self.assertEqual(
            response.data[0]['new_role'],
            User.Role.DETAILER
        )

        self.assertEqual(
            response.data[0]['changed_by_username'],
            self.admin.username
        )