
from datetime import date, time, timedelta

from django.urls import reverse
from django.utils import timezone

from rest_framework.test import APITestCase

from accounts.models import User
from branches.models import Branch
from staff.models import ShiftAssignment, StaffProfile

from .models import (
    AttendanceRecord,
    ShiftConfiguration,
    ShiftInstance,
)


class OperationsAttendanceReportTests(APITestCase):

    def setUp(self):
        self.today = timezone.localdate()

        self.branch = Branch.objects.create(
            name='NEV CARWASH',
            code='NEV-TEST-001',
            town='Kikuyu',
            address='Kikuyu Town',
        )

        self.other_branch = Branch.objects.create(
            name='Other Test Branch',
            code='NEV-TEST-002',
            town='Nairobi',
        )

        self.supervisor_user = User.objects.create_user(
            username='test_supervisor',
            email='supervisor@test.example',
            password='TestPassword123!',
            role='SUPERVISOR',
        )

        self.supervisor = StaffProfile.objects.create(
            user=self.supervisor_user,
            staff_number='SUP-001',
            branch=self.branch,
            date_joined=self.today - timedelta(days=30),
        )

        self.employee_user = User.objects.create_user(
            username='test_cleaner',
            email='cleaner@test.example',
            password='TestPassword123!',
            role='CLEANER',
        )

        self.employee = StaffProfile.objects.create(
            user=self.employee_user,
            staff_number='CLN-001',
            branch=self.branch,
            date_joined=self.today - timedelta(days=30),
        )

        self.day_configuration = ShiftConfiguration.objects.create(
            branch=self.branch,
            shift_type='DAY',
            start_time=time(7, 0),
            end_time=time(19, 0),
            early_check_in_minutes=30,
            late_grace_minutes=15,
        )

        self.night_configuration = ShiftConfiguration.objects.create(
            branch=self.branch,
            shift_type='NIGHT',
            start_time=time(19, 0),
            end_time=time(7, 0),
            early_check_in_minutes=30,
            late_grace_minutes=15,
        )

        self.assignment = ShiftAssignment.objects.create(
            staff=self.employee,
            shift='DAY',
            effective_from=self.today - timedelta(days=30),
            changed_by=self.supervisor_user,
            reason='Initial test assignment',
        )

        self.url = reverse('attendance_operations_report')

        self.client.force_authenticate(
            user=self.supervisor_user,
        )

    def create_shift_instance(self, work_date, shift_type):
        configuration = (
            self.day_configuration
            if shift_type == 'DAY'
            else self.night_configuration
        )

        start_naive = timezone.datetime.combine(
            work_date,
            configuration.start_time,
        )

        end_date = work_date

        if configuration.end_time <= configuration.start_time:
            end_date += timedelta(days=1)

        end_naive = timezone.datetime.combine(
            end_date,
            configuration.end_time,
        )

        current_timezone = timezone.get_current_timezone()

        return ShiftInstance.objects.create(
            configuration=configuration,
            branch=self.branch,
            shift_type=shift_type,
            work_date=work_date,
            scheduled_start=timezone.make_aware(
                start_naive,
                current_timezone,
            ),
            scheduled_end=timezone.make_aware(
                end_naive,
                current_timezone,
            ),
            configuration_snapshot={
                'start_time': configuration.start_time.isoformat(),
                'end_time': configuration.end_time.isoformat(),
            },
        )

    def get_branch_report(self, response):
        self.assertEqual(len(response.data['branches']), 1)
        return response.data['branches'][0]

    def test_future_shift_employee_is_not_clocked_in(self):
        future_date = self.today + timedelta(days=1)

        response = self.client.get(
            self.url,
            {
                'work_date': future_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)

        branch_report = self.get_branch_report(response)

        day_shift = next(
            shift
            for shift in branch_report['shifts']
            if shift['shift_type'] == 'DAY'
        )

        self.assertEqual(
            day_shift['summary']['total_expected'],
            1,
        )

        self.assertEqual(
            day_shift['summary']['not_clocked_in'],
            1,
        )

        employee_row = day_shift['employees'][0]

        self.assertEqual(
            employee_row['status'],
            'NOT_CLOCKED_IN',
        )

    def test_employee_is_absent_after_shift_end(self):
        past_date = self.today - timedelta(days=2)

        response = self.client.get(
            self.url,
            {
                'work_date': past_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)

        branch_report = self.get_branch_report(response)

        day_shift = next(
            shift
            for shift in branch_report['shifts']
            if shift['shift_type'] == 'DAY'
        )

        self.assertEqual(
            day_shift['summary']['absent'],
            1,
        )

        self.assertEqual(
            day_shift['employees'][0]['status'],
            'ABSENT',
        )

    def test_absence_is_not_saved_when_report_is_viewed(self):
        past_date = self.today - timedelta(days=2)

        response = self.client.get(
            self.url,
            {
                'work_date': past_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)

        self.assertEqual(
            AttendanceRecord.objects.filter(
                staff=self.employee,
            ).count(),
            0,
        )

    def test_supervisor_cannot_view_another_branch(self):
        response = self.client.get(
            self.url,
            {
                'work_date': self.today.isoformat(),
                'branch': str(self.other_branch.pk),
            },
        )

        self.assertEqual(response.status_code, 403)

    def test_invalid_shift_filter_is_rejected(self):
        response = self.client.get(
            self.url,
            {
                'work_date': self.today.isoformat(),
                'shift': 'EVENING',
            },
        )

        self.assertEqual(response.status_code, 400)

    def test_day_filter_returns_only_day_shift(self):
        response = self.client.get(
            self.url,
            {
                'work_date': self.today.isoformat(),
                'shift': 'DAY',
            },
        )

        self.assertEqual(response.status_code, 200)

        branch_report = self.get_branch_report(response)

        self.assertEqual(
            len(branch_report['shifts']),
            1,
        )

        self.assertEqual(
            branch_report['shifts'][0]['shift_type'],
            'DAY',
        )

    def test_all_filter_returns_day_and_night(self):
        response = self.client.get(
            self.url,
            {
                'work_date': self.today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)

        branch_report = self.get_branch_report(response)

        shift_types = {
            shift['shift_type']
            for shift in branch_report['shifts']
        }

        self.assertEqual(
            shift_types,
            {'DAY', 'NIGHT'},
        )

    def test_missing_work_date_uses_operational_date(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)

        self.assertIn(
            'work_date',
            response.data,
        )

        self.assertIn(
            'branches',
            response.data,
        )

    def test_employee_attendance_response_does_not_expose_gps_coordinates(self):
        future_date = self.today + timedelta(days=1)

        response = self.client.get(
            self.url,
            {
                'work_date': future_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)

        branch_report = self.get_branch_report(response)

        employee_row = branch_report['shifts'][0]['employees'][0]

        self.assertNotIn('clock_in_latitude', employee_row)
        self.assertNotIn('clock_in_longitude', employee_row)
        self.assertNotIn('clock_out_latitude', employee_row)
        self.assertNotIn('clock_out_longitude', employee_row)
