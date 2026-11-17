
from datetime import datetime, time, timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch
from staff.models import ShiftAssignment, StaffProfile

from .models import (
    AttendanceOverrideRequest,
    AttendanceAuditLog,
    AttendanceRecord,
    ShiftAttendanceAuthorization,
    ShiftConfiguration,
    ShiftInstance,
)

from .serializers import (
    AttendanceOverrideCreateSerializer,
    AttendanceOverrideReviewSerializer,
    AttendanceOverrideRequestSerializer,
    AttendanceAuditLogSerializer,
    EmployeeAttendanceGPSSerializer,
)

from .services import (
    AttendanceError,
    create_attendance_override_request,
    review_attendance_override_request,
    execute_attendance_override_request,
    clock_in,
    clock_out,
)


OPERATIONAL_DAY_START = time(7, 0)


def get_user_role(user):
    """Return the user's effective role."""
    if user.is_superuser:
        return 'OWNER'

    return getattr(user, 'role', None)


def is_override_manager(user):
    """Check whether a user can manage attendance overrides."""
    return get_user_role(user) in {
        'OWNER',
        'ADMIN',
        'SUPERVISOR',
    }


def get_supervisor_branch(user):
    """Return the supervisor's branch ID."""
    try:
        return user.staff_profile.branch_id
    except AttributeError:
        return None


def get_accessible_override_requests(user):
    """
    Return override requests accessible to the current user.

    Owners and admins can access all branches.
    Supervisors can access requests from their own branch only.
    Other users cannot access override requests.
    """
    queryset = AttendanceOverrideRequest.objects.select_related(
        'attendance',
        'shift_instance',
        'requested_by',
        'reviewed_by',
        'staff__user',
        'branch',
    )

    role = get_user_role(user)

    if role in {'OWNER', 'ADMIN'}:
        return queryset

    if role == 'SUPERVISOR':
        branch_id = get_supervisor_branch(user)

        if branch_id is None:
            return queryset.none()

        return queryset.filter(branch_id=branch_id)

    return queryset.none()


def serialize_employee_attendance(record):
    """Return limited attendance information for the employee."""
    shift = record.shift_instance

    return {
        'id': record.id,
        'attendance_status': record.attendance_status,
        'checkout_status': record.checkout_status,
        'clock_in': (
            record.clock_in.isoformat()
            if record.clock_in else None
        ),
        'clock_out': (
            record.clock_out.isoformat()
            if record.clock_out else None
        ),
        'clock_in_distance': (
            str(record.clock_in_distance)
            if record.clock_in_distance is not None else None
        ),
        'clock_out_distance': (
            str(record.clock_out_distance)
            if record.clock_out_distance is not None else None
        ),
        'clock_in_verification': record.clock_in_verification,
        'clock_out_verification': record.clock_out_verification,
        'branch_name': record.branch.name,
        'shift_type': shift.shift_type if shift else None,
        'work_date': (
            shift.work_date.isoformat()
            if shift else None
        ),
    }


def get_default_operational_date():
    """
    Return the current operational date.

    The operational day runs from 07:00 to 07:00 the following day.
    Before 07:00, the current operational date is the previous
    calendar date.
    """
    local_now = timezone.localtime()
    operational_date = local_now.date()

    if local_now.time().replace(tzinfo=None) < OPERATIONAL_DAY_START:
        operational_date -= timedelta(days=1)

    return operational_date


def build_shift_schedule(work_date, configuration):
    """Build timezone-aware scheduled start and end datetimes."""
    start_naive = datetime.combine(
        work_date,
        configuration.start_time,
    )

    end_date = work_date

    if configuration.end_time <= configuration.start_time:
        end_date += timedelta(days=1)

    end_naive = datetime.combine(
        end_date,
        configuration.end_time,
    )

    current_timezone = timezone.get_current_timezone()

    return (
        timezone.make_aware(start_naive, current_timezone),
        timezone.make_aware(end_naive, current_timezone),
    )


def get_shift_operational_status(now, scheduled_start, scheduled_end):
    """Calculate the current operational status of a shift."""
    if now < scheduled_start:
        return ShiftInstance.Status.SCHEDULED

    if now < scheduled_end:
        return ShiftInstance.Status.IN_PROGRESS

    return ShiftInstance.Status.COMPLETED


def empty_attendance_summary():
    return {
        'total_expected': 0,
        'on_time': 0,
        'late': 0,
        'not_clocked_in': 0,
        'absent': 0,
        'currently_working': 0,
        'clocked_out': 0,
    }


def summarize_attendance_rows(rows):
    """Calculate summary figures from employee attendance rows."""
    summary = empty_attendance_summary()

    summary['total_expected'] = len(rows)

    for row in rows:
        attendance_status = row['status']

        if attendance_status == 'ON_TIME':
            summary['on_time'] += 1
            if not row['clock_out']:
                summary['currently_working'] += 1

        elif attendance_status == 'LATE':
            summary['late'] += 1
            if not row['clock_out']:
                summary['currently_working'] += 1

        elif attendance_status == 'ABSENT':
            summary['absent'] += 1

        elif attendance_status == 'NOT_CLOCKED_IN':
            summary['not_clocked_in'] += 1

        if row['checkout_status'] in {
            AttendanceRecord.CheckoutStatus.MANUAL,
            AttendanceRecord.CheckoutStatus.AUTO,
        }:
            summary['clocked_out'] += 1

    return summary


def get_attendance_status_for_employee(
    attendance_record,
    now,
    scheduled_end,
):
    """
    Calculate an employee's reporting status.

    An employee without a clock-in remains NOT_CLOCKED_IN until
    the scheduled shift end. Only then are they classified as ABSENT.

    This function does not create or modify AttendanceRecord rows.
    """
    if attendance_record and attendance_record.clock_in:
        if (
            attendance_record.attendance_status
            == AttendanceRecord.AttendanceStatus.LATE
        ):
            return 'LATE'

        return 'ON_TIME'

    if scheduled_end is not None and now >= scheduled_end:
        return 'ABSENT'

    return 'NOT_CLOCKED_IN'


def serialize_operations_attendance(
    staff,
    shift_type,
    permanent_assignment,
    authorization,
    attendance_record,
    now,
    scheduled_end,
):
    """Serialize one employee's operational attendance information."""
    status_value = get_attendance_status_for_employee(
        attendance_record=attendance_record,
        now=now,
        scheduled_end=scheduled_end,
    )

    if attendance_record:
        clock_in = attendance_record.clock_in
        clock_out = attendance_record.clock_out
        checkout_status = attendance_record.checkout_status
        verification = attendance_record.clock_in_verification
        attendance_id = attendance_record.pk
    else:
        clock_in = None
        clock_out = None
        checkout_status = AttendanceRecord.CheckoutStatus.NOT_STARTED
        verification = None
        attendance_id = None

    full_name = staff.user.get_full_name().strip()

    if not full_name:
        full_name = staff.user.username

    return {
        'attendance_id': attendance_id,
        'staff_id': staff.pk,
        'staff_number': staff.staff_number,
        'employee_name': full_name,
        'role': staff.user.role,
        'permanent_shift': (
            permanent_assignment.shift
            if permanent_assignment else None
        ),
        'attendance_shift': shift_type,
        'shift_authorization_id': (
            authorization.pk if authorization else None
        ),
        'status': status_value,
        'clock_in': (
            clock_in.isoformat() if clock_in else None
        ),
        'clock_out': (
            clock_out.isoformat() if clock_out else None
        ),
        'checkout_status': checkout_status,
        'clock_in_verification': verification,
    }


def build_branch_operations_report(
    branch,
    work_date,
    shift_filter,
    now,
):
    """
    Build a read-only DAY/NIGHT attendance report for one branch.

    Shift instances are reused when they exist. If they do not exist,
    the schedule is calculated from the active shift configuration.

    This function never creates ShiftInstance or AttendanceRecord rows.
    """
    configurations = {
        configuration.shift_type: configuration
        for configuration in ShiftConfiguration.objects.filter(
            branch=branch,
            is_active=True,
        )
    }

    instances = {
        instance.shift_type: instance
        for instance in ShiftInstance.objects.select_related(
            'configuration',
        ).filter(
            branch=branch,
            work_date=work_date,
        )
    }

    staff_profiles = list(
        StaffProfile.objects.select_related(
            'user',
            'branch',
        ).filter(
            branch=branch,
            employment_status=StaffProfile.EmploymentStatus.ACTIVE,
            is_archived=False,
            user__is_active=True,
        ).order_by('staff_number')
    )

    staff_ids = [staff.pk for staff in staff_profiles]

    assignments = ShiftAssignment.objects.filter(
        staff_id__in=staff_ids,
        effective_from__lte=work_date,
    ).filter(
        Q(effective_to__isnull=True)
        | Q(effective_to__gte=work_date)
    ).order_by(
        'staff_id',
        '-effective_from',
        '-id',
    )

    permanent_assignments = {}

    for assignment in assignments:
        permanent_assignments.setdefault(
            assignment.staff_id,
            assignment,
        )

    approved_authorizations = []

    if instances:
        approved_authorizations = list(
            ShiftAttendanceAuthorization.objects.select_related(
                'staff',
                'permanent_shift_assignment',
                'shift_instance',
            ).filter(
                shift_instance__in=list(instances.values()),
                staff_id__in=staff_ids,
                status=ShiftAttendanceAuthorization.Status.APPROVED,
            ).order_by(
                'staff_id',
                '-reviewed_at',
                '-id',
            )
        )

    # An approved alternate shift moves the employee's expected
    # attendance from their permanent shift to the authorized shift.
    authorization_by_staff = {}

    for authorization in approved_authorizations:
        staff_id = authorization.staff_id
        permanent_assignment = permanent_assignments.get(staff_id)

        if permanent_assignment is None:
            continue

        if (
            authorization.permanent_shift_assignment_id
            != permanent_assignment.pk
        ):
            continue

        authorization_by_staff.setdefault(
            staff_id,
            authorization,
        )

    expected_by_shift = {
        'DAY': {},
        'NIGHT': {},
    }

    for staff in staff_profiles:
        assignment = permanent_assignments.get(staff.pk)

        if assignment is None:
            continue

        authorization = authorization_by_staff.get(staff.pk)

        if authorization:
            expected_shift = authorization.shift_instance.shift_type
        else:
            expected_shift = assignment.shift

        expected_by_shift[expected_shift][staff.pk] = {
            'staff': staff,
            'assignment': assignment,
            'authorization': authorization,
        }

    selected_shifts = (
        ['DAY', 'NIGHT']
        if shift_filter == 'ALL'
        else [shift_filter]
    )

    shift_reports = []
    branch_summary = empty_attendance_summary()

    for shift_type in selected_shifts:
        configuration = configurations.get(shift_type)
        instance = instances.get(shift_type)

        if instance:
            scheduled_start = instance.scheduled_start
            scheduled_end = instance.scheduled_end
            configuration_id = instance.configuration_id
            instance_id = instance.pk
            instance_status = (
                ShiftInstance.Status.FINALIZED
                if instance.status == ShiftInstance.Status.FINALIZED
                else get_shift_operational_status(
                    now,
                    scheduled_start,
                    scheduled_end,
                )
            )

        elif configuration:
            scheduled_start, scheduled_end = build_shift_schedule(
                work_date,
                configuration,
            )
            configuration_id = configuration.pk
            instance_id = None
            instance_status = get_shift_operational_status(
                now,
                scheduled_start,
                scheduled_end,
            )

        else:
            scheduled_start = None
            scheduled_end = None
            configuration_id = None
            instance_id = None
            instance_status = 'CONFIGURATION_MISSING'

        attendance_records = {}

        if instance:
            records = AttendanceRecord.objects.filter(
                shift_instance=instance,
                staff_id__in=list(
                    expected_by_shift[shift_type].keys()
                ),
            )

            attendance_records = {
                record.staff_id: record
                for record in records
            }

        employee_rows = []

        for staff_id, expected in expected_by_shift[shift_type].items():
            staff = expected['staff']
            assignment = expected['assignment']
            authorization = expected['authorization']
            attendance_record = attendance_records.get(staff_id)

            employee_rows.append(
                serialize_operations_attendance(
                    staff=staff,
                    shift_type=shift_type,
                    permanent_assignment=assignment,
                    authorization=authorization,
                    attendance_record=attendance_record,
                    now=now,
                    scheduled_end=scheduled_end,
                )
            )

        employee_rows.sort(
            key=lambda row: (
                row['employee_name'].lower(),
                row['staff_number'],
            )
        )

        shift_summary = summarize_attendance_rows(employee_rows)

        for key, value in shift_summary.items():
            branch_summary[key] += value

        shift_reports.append({
            'shift_type': shift_type,
            'shift_instance_id': instance_id,
            'configuration_id': configuration_id,
            'scheduled_start': (
                scheduled_start.isoformat()
                if scheduled_start else None
            ),
            'scheduled_end': (
                scheduled_end.isoformat()
                if scheduled_end else None
            ),
            'status': instance_status,
            'summary': shift_summary,
            'employees': employee_rows,
        })

    return {
        'branch_id': branch.pk,
        'branch_name': branch.name,
        'branch_code': branch.code,
        'summary': branch_summary,
        'shifts': shift_reports,
    }


class SupervisorOperationsAttendanceView(APIView):
    """
    Read-only branch operations attendance report.

    Supervisors can view their entire branch.
    Admins and owners can view all active branches or filter by branch.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)

        if role not in {'OWNER', 'ADMIN', 'SUPERVISOR'}:
            raise PermissionDenied(
                'You do not have permission to view operations attendance.'
            )

        work_date_value = request.query_params.get('work_date')

        if work_date_value:
            work_date = parse_date(work_date_value)

            if work_date is None:
                raise ValidationError({
                    'work_date': 'Use YYYY-MM-DD format.'
                })
        else:
            work_date = get_default_operational_date()

        shift_filter = request.query_params.get(
            'shift',
            'ALL',
        ).upper()

        if shift_filter not in {'ALL', 'DAY', 'NIGHT'}:
            raise ValidationError({
                'shift': 'Choose ALL, DAY, or NIGHT.'
            })

        branch_filter = request.query_params.get('branch')

        branches = Branch.objects.filter(
            is_active=True,
        ).order_by('name')

        if role == 'SUPERVISOR':
            branch_id = get_supervisor_branch(request.user)

            if branch_id is None:
                raise PermissionDenied(
                    'Your account is not linked to a staff profile.'
                )

            if branch_filter and (
                not branch_filter.isdigit()
                or int(branch_filter) != branch_id
            ):
                raise PermissionDenied(
                    'You can only view your own branch.'
                )

            branches = branches.filter(pk=branch_id)

            if not branches.exists():
                raise PermissionDenied(
                    'Your assigned branch is not active or does not exist.'
                )

        elif branch_filter:
            if not branch_filter.isdigit():
                raise ValidationError({
                    'branch': 'Branch must be a valid numeric ID.'
                })

            branches = branches.filter(pk=int(branch_filter))

            if not branches.exists():
                raise ValidationError({
                    'branch': 'The selected active branch was not found.'
                })

        now = timezone.now()

        branch_reports = [
            build_branch_operations_report(
                branch=branch,
                work_date=work_date,
                shift_filter=shift_filter,
                now=now,
            )
            for branch in branches
        ]

        return Response({
            'work_date': work_date.isoformat(),
            'shift_filter': shift_filter,
            'operational_day_start': '07:00',
            'generated_at': now.isoformat(),
            'branches': branch_reports,
        })


class MyAttendanceView(APIView):
    """Return the signed-in employee's current attendance status."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            staff = StaffProfile.objects.select_related(
                'branch',
                'user',
            ).get(user=request.user)

        except StaffProfile.DoesNotExist:
            raise PermissionDenied(
                'Your account is not linked to a staff profile.'
            )

        if staff.employment_status != StaffProfile.EmploymentStatus.ACTIVE:
            raise PermissionDenied(
                'Your employment status does not permit attendance.'
            )

        open_records = AttendanceRecord.objects.select_related(
            'branch',
            'shift_instance',
        ).filter(
            staff=staff,
            checkout_status=AttendanceRecord.CheckoutStatus.OPEN,
        )

        if open_records.count() > 1:
            raise ValidationError({
                'detail': (
                    'Multiple open attendance records were found. '
                    'Please contact your supervisor.'
                )
            })

        record = open_records.first()

        return Response({
            'is_clocked_in': record is not None,
            'attendance': (
                serialize_employee_attendance(record)
                if record else None
            ),
        })


class EmployeeClockInView(APIView):
    """GPS-verified self-service employee clock-in."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EmployeeAttendanceGPSSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        try:
            record = clock_in(
                user=request.user,
                latitude=serializer.validated_data['latitude'],
                longitude=serializer.validated_data['longitude'],
                accuracy=serializer.validated_data['accuracy'],
                ip_address=request.META.get('REMOTE_ADDR'),
            )

        except AttendanceError as error:
            raise ValidationError({
                'detail': str(error),
            })

        return Response(
            {
                'detail': 'You have successfully clocked in.',
                'is_clocked_in': True,
                'attendance': serialize_employee_attendance(record),
            },
            status=status.HTTP_201_CREATED,
        )


class EmployeeClockOutView(APIView):
    """GPS-verified self-service employee clock-out."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EmployeeAttendanceGPSSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        try:
            record = clock_out(
                user=request.user,
                latitude=serializer.validated_data['latitude'],
                longitude=serializer.validated_data['longitude'],
                accuracy=serializer.validated_data['accuracy'],
                ip_address=request.META.get('REMOTE_ADDR'),
            )

        except AttendanceError as error:
            raise ValidationError({
                'detail': str(error),
            })

        return Response({
            'detail': 'You have successfully clocked out.',
            'is_clocked_in': False,
            'attendance': serialize_employee_attendance(record),
        })


class AttendanceOverrideListCreateView(APIView):
    """List and create assisted attendance override requests."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_override_manager(request.user):
            raise PermissionDenied(
                'You do not have permission to view override requests.'
            )

        queryset = get_accessible_override_requests(request.user)

        request_status = request.query_params.get('status')

        if request_status:
            valid_statuses = {
                'PENDING',
                'APPROVED',
                'REJECTED',
            }

            if request_status not in valid_statuses:
                raise ValidationError({
                    'status': 'Invalid status filter.'
                })

            queryset = queryset.filter(status=request_status)

        serializer = AttendanceOverrideRequestSerializer(
            queryset.order_by('-created_at'),
            many=True,
        )

        return Response(serializer.data)

    def post(self, request):
        if not is_override_manager(request.user):
            raise PermissionDenied(
                'You do not have permission to create override requests.'
            )

        serializer = AttendanceOverrideCreateSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        try:
            override_request = create_attendance_override_request(
                requested_by=request.user,
                **serializer.validated_data,
            )

        except AttendanceError as error:
            raise ValidationError({
                'detail': str(error)
            })

        except DjangoValidationError as error:
            raise ValidationError(error.messages)

        override_request = get_object_or_404(
            get_accessible_override_requests(request.user),
            pk=override_request.pk,
        )

        return Response(
            AttendanceOverrideRequestSerializer(
                override_request,
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AttendanceOverrideDetailView(APIView):
    """Retrieve an individual attendance override request."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not is_override_manager(request.user):
            raise PermissionDenied(
                'You do not have permission to view this request.'
            )

        override_request = get_object_or_404(
            get_accessible_override_requests(request.user),
            pk=pk,
        )

        return Response(
            AttendanceOverrideRequestSerializer(
                override_request,
            ).data,
        )


class AttendanceOverrideReviewView(APIView):
    """Approve or reject an attendance override request."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_override_manager(request.user):
            raise PermissionDenied(
                'You do not have permission to review override requests.'
            )

        serializer = AttendanceOverrideReviewSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        try:
            override_request = review_attendance_override_request(
                reviewed_by=request.user,
                request_id=pk,
                decision=serializer.validated_data['decision'],
                reason=serializer.validated_data['reason'],
            )

        except AttendanceError as error:
            raise ValidationError({
                'detail': str(error)
            })

        except AttendanceOverrideRequest.DoesNotExist:
            raise ValidationError({
                'detail': 'Override request not found.'
            })

        override_request = get_object_or_404(
            get_accessible_override_requests(request.user),
            pk=override_request.pk,
        )

        return Response(
            AttendanceOverrideRequestSerializer(
                override_request,
            ).data,
        )


class AttendanceOverrideExecuteView(APIView):
    """Execute an approved assisted attendance action."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_override_manager(request.user):
            raise PermissionDenied(
                'You do not have permission to execute override requests.'
            )

        try:
            attendance = execute_attendance_override_request(
                executed_by=request.user,
                request_id=pk,
            )

        except AttendanceError as error:
            raise ValidationError({
                'detail': str(error)
            })

        except AttendanceOverrideRequest.DoesNotExist:
            raise ValidationError({
                'detail': 'Override request not found.'
            })

        return Response({
            'detail': 'Assisted attendance action executed successfully.',
            'attendance_id': attendance.pk,
            'staff_id': attendance.staff_id,
            'shift_instance_id': attendance.shift_instance_id,
            'attendance_status': attendance.attendance_status,
            'checkout_status': attendance.checkout_status,
            'clock_in': attendance.clock_in,
            'clock_out': attendance.clock_out,
            'clock_in_verification': attendance.clock_in_verification,
        })


class AttendanceOverrideAuditView(generics.ListAPIView):
    """Retrieve the audit history for an attendance override request."""

    serializer_class = AttendanceAuditLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if not is_override_manager(user):
            raise PermissionDenied(
                'You do not have permission to view attendance audit logs.'
            )

        override_request = get_object_or_404(
            get_accessible_override_requests(user),
            pk=self.kwargs['pk'],
        )

        queryset = AttendanceAuditLog.objects.select_related(
            'actor',
            'attendance',
            'shift_instance',
        )

        if override_request.attendance_id:
            return queryset.filter(
                models.Q(
                    attendance_id=override_request.attendance_id,
                )
                | models.Q(
                    shift_instance_id=override_request.shift_instance_id,
                    action__in=[
                        'OVERRIDE_REQUEST_APPROVED',
                        'OVERRIDE_REQUEST_REJECTED',
                    ],
                    new_values__request_id=override_request.pk,
                )
            ).order_by('created_at')

        return queryset.filter(
            shift_instance_id=override_request.shift_instance_id,
            action__in=[
                'OVERRIDE_REQUEST_APPROVED',
                'OVERRIDE_REQUEST_REJECTED',
            ],
            new_values__request_id=override_request.pk,
        ).order_by('created_at')


class ShiftInstanceListView(generics.ListAPIView):
    """List shift instances accessible to attendance managers."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if not is_override_manager(user):
            raise PermissionDenied(
                'You do not have permission to view shift instances.'
            )

        queryset = ShiftInstance.objects.select_related(
            'branch',
            'configuration',
        ).all()

        role = get_user_role(user)

        if role == 'SUPERVISOR':
            branch_id = get_supervisor_branch(user)

            if branch_id is None:
                raise PermissionDenied(
                    'Your account is not linked to a branch.'
                )

            queryset = queryset.filter(branch_id=branch_id)

        branch_id = self.request.query_params.get('branch')
        work_date = self.request.query_params.get('work_date')
        shift_status = self.request.query_params.get('status')

        if branch_id:
            if not branch_id.isdigit():
                raise ValidationError({
                    'branch': 'Branch must be a valid numeric ID.'
                })

            queryset = queryset.filter(branch_id=branch_id)

        if work_date:
            parsed_date = parse_date(work_date)

            if parsed_date is None:
                raise ValidationError({
                    'work_date': 'Use YYYY-MM-DD format.'
                })

            queryset = queryset.filter(work_date=parsed_date)

        if shift_status:
            valid_statuses = {
                'SCHEDULED',
                'IN_PROGRESS',
                'COMPLETED',
                'FINALIZED',
            }

            if shift_status not in valid_statuses:
                raise ValidationError({
                    'status': 'Invalid status filter.'
                })

            queryset = queryset.filter(status=shift_status)

        return queryset.order_by('-scheduled_start')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        data = [
            {
                'id': shift.id,
                'branch': shift.branch_id,
                'branch_name': shift.branch.name,
                'shift_type': shift.shift_type,
                'work_date': shift.work_date,
                'scheduled_start': shift.scheduled_start,
                'scheduled_end': shift.scheduled_end,
                'status': shift.status,
            }
            for shift in queryset
        ]

        return Response(data)
