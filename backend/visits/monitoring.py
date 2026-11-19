
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.models import StaffProfile

from .models import Visit, ServiceAssignment
from .assignment_corrections import ServiceAssignmentCorrection


# --------------------------------------------------
# SHIFT FILTERING
# --------------------------------------------------

SHIFT_FILTER_CHOICES = {
    'ALL',
    'DAY',
    'NIGHT',
    'NOT_RECORDED',
}


def get_shift_filter(request):
    """
    Read and validate the optional shift filter.

    Supports both ?shift_filter=DAY and ?shift=DAY.
    """
    raw_filter = request.query_params.get(
        'shift_filter',
        request.query_params.get('shift', 'ALL'),
    )

    shift_filter = (raw_filter or 'ALL').strip().upper()

    if shift_filter not in SHIFT_FILTER_CHOICES:
        raise ValidationError({
            'shift_filter': (
                'Choose ALL, DAY, NIGHT or NOT_RECORDED.'
            )
        })

    return shift_filter


def apply_shift_filter(queryset, shift_filter):
    if shift_filter == 'DAY':
        return queryset.filter(shift='DAY')

    if shift_filter == 'NIGHT':
        return queryset.filter(shift='NIGHT')

    if shift_filter == 'NOT_RECORDED':
        return queryset.filter(shift__isnull=True)

    return queryset


# --------------------------------------------------
# SHARED ACCESS CONTROL
# --------------------------------------------------

def get_active_staff_profile(user):
    profile = (
        StaffProfile.objects
        .select_related('branch', 'user')
        .filter(
            user=user,
            employment_status=StaffProfile.EmploymentStatus.ACTIVE,
            is_archived=False,
            user__is_active=True,
        )
        .first()
    )

    if profile is None:
        raise PermissionDenied(
            'An active staff profile with an assigned branch is required.'
        )

    if not profile.branch.is_active:
        raise PermissionDenied(
            'Your assigned branch is inactive.'
        )

    return profile


def get_monitoring_access(user):
    """
    SUPERVISOR: own assignments, own branch.
    ADMIN: all assignments in their branch.
    OWNER: all branches.
    Superuser: treated as OWNER.
    """

    role = getattr(user, 'role', None)

    if user.is_superuser or role == 'OWNER':
        return {
            'role': 'OWNER',
            'profile': None,
            'branch_id': None,
            'branch_name': 'All branches',
        }

    if role == 'ADMIN':
        profile = get_active_staff_profile(user)

        return {
            'role': 'ADMIN',
            'profile': profile,
            'branch_id': profile.branch_id,
            'branch_name': profile.branch.name,
        }

    if role == 'SUPERVISOR':
        profile = get_active_staff_profile(user)

        return {
            'role': 'SUPERVISOR',
            'profile': profile,
            'branch_id': profile.branch_id,
            'branch_name': profile.branch.name,
        }

    raise PermissionDenied(
        'You do not have permission to monitor service assignments.'
    )


def get_monitoring_queryset(user, access):
    queryset = (
        ServiceAssignment.objects
        .select_related(
            'staff',
            'staff__user',
            'assigned_by',
            'completed_by',
            'removed_by',
            'visit_service',
            'visit_service__visit',
            'visit_service__visit__vehicle',
            'visit_service__visit__branch',
            'visit_service__service',
        )
    )

    if access['role'] == 'SUPERVISOR':
        queryset = queryset.filter(
            assigned_by=user,
            visit_service__visit__branch_id=access['branch_id'],
        )

    elif access['role'] == 'ADMIN':
        queryset = queryset.filter(
            visit_service__visit__branch_id=access['branch_id'],
        )

    # OWNER and superuser can see all branches.
    return queryset


# --------------------------------------------------
# SERIALIZERS
# --------------------------------------------------

class MonitorAssignmentSerializer(serializers.ModelSerializer):
    visit_id = serializers.IntegerField(
        source='visit_service.visit_id',
        read_only=True,
    )

    branch_id = serializers.IntegerField(
        source='visit_service.visit.branch_id',
        read_only=True,
    )

    branch_name = serializers.CharField(
        source='visit_service.visit.branch.name',
        read_only=True,
    )

    visit_status = serializers.CharField(
        source='visit_service.visit.status',
        read_only=True,
    )

    vehicle_registration = serializers.CharField(
        source='visit_service.visit.vehicle.registration_number',
        read_only=True,
    )

    vehicle_make_model = serializers.CharField(
        source='visit_service.visit.vehicle.make_model',
        read_only=True,
    )

    service_name = serializers.CharField(
        source='visit_service.service_name',
        read_only=True,
    )

    service_code = serializers.CharField(
        source='visit_service.service_code',
        read_only=True,
    )

    service_category = serializers.CharField(
        source='visit_service.service_category',
        read_only=True,
    )

    service_price = serializers.DecimalField(
        source='visit_service.original_price',
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )

    staff_name = serializers.CharField(
        source='staff.user.get_full_name',
        read_only=True,
    )

    staff_number = serializers.CharField(
        source='staff.staff_number',
        read_only=True,
    )

    assigned_by_name = serializers.CharField(
        source='assigned_by.get_full_name',
        read_only=True,
    )

    completed_by_name = serializers.SerializerMethodField()
    removed_by_name = serializers.SerializerMethodField()
    shift_display = serializers.SerializerMethodField()

    is_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = ServiceAssignment

        fields = [
            'id',
            'visit_id',
            'branch_id',
            'branch_name',
            'visit_status',
            'vehicle_registration',
            'vehicle_make_model',
            'service_name',
            'service_code',
            'service_category',
            'service_price',
            'staff',
            'staff_name',
            'staff_number',
            'shift',
            'shift_display',
            'assigned_by',
            'assigned_by_name',
            'assigned_at',
            'completed_at',
            'completed_by',
            'completed_by_name',
            'is_completed',
            'is_active',
            'removed_at',
            'removed_by',
            'removed_by_name',
            'removal_reason',
        ]

        read_only_fields = fields

    def get_shift_display(self, obj):
        if not obj.shift:
            return 'Not recorded'

        return obj.get_shift_display()

    def get_completed_by_name(self, obj):
        if obj.completed_by is None:
            return None

        return (
            obj.completed_by.get_full_name()
            or obj.completed_by.username
        )

    def get_removed_by_name(self, obj):
        if obj.removed_by is None:
            return None

        return (
            obj.removed_by.get_full_name()
            or obj.removed_by.username
        )


class MonitorAssignmentReassignSerializer(serializers.Serializer):
    new_staff_id = serializers.IntegerField(min_value=1)

    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
    )

    def validate_reason(self, value):
        value = value.strip()

        if len(value) < 3:
            raise serializers.ValidationError(
                'Please provide a meaningful reassignment reason.'
            )

        return value


class MonitorAssignmentRemoveSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
    )

    def validate_reason(self, value):
        value = value.strip()

        if len(value) < 3:
            raise serializers.ValidationError(
                'Please provide a meaningful removal reason.'
            )

        return value


class AssignmentCorrectionSerializer(serializers.Serializer):
    new_staff_id = serializers.IntegerField(min_value=1)

    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
    )

    def validate_reason(self, value):
        value = value.strip()

        if len(value) < 3:
            raise serializers.ValidationError(
                'Please provide a meaningful correction reason.'
            )

        return value


class AssignmentCorrectionHistorySerializer(serializers.ModelSerializer):
    previous_staff_name = serializers.SerializerMethodField()

    previous_staff_number = serializers.CharField(
        source='previous_staff.staff_number',
        read_only=True,
    )

    new_staff_name = serializers.SerializerMethodField()

    new_staff_number = serializers.CharField(
        source='new_staff.staff_number',
        read_only=True,
    )

    corrected_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ServiceAssignmentCorrection

        fields = [
            'id',
            'assignment',
            'previous_staff',
            'previous_staff_name',
            'previous_staff_number',
            'new_staff',
            'new_staff_name',
            'new_staff_number',
            'corrected_by',
            'corrected_by_name',
            'reason',
            'created_at',
        ]

        read_only_fields = fields

    def get_previous_staff_name(self, obj):
        user = obj.previous_staff.user
        return user.get_full_name() or user.username

    def get_new_staff_name(self, obj):
        user = obj.new_staff.user
        return user.get_full_name() or user.username

    def get_corrected_by_name(self, obj):
        user = obj.corrected_by
        return user.get_full_name() or user.username


# --------------------------------------------------
# SUPERVISOR MONITORING BASE
# --------------------------------------------------

class SupervisorMonitorBaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get_supervisor_profile(self, request):
        if getattr(request.user, 'role', None) != 'SUPERVISOR':
            raise PermissionDenied(
                'This action is available to supervisors only.'
            )

        return get_active_staff_profile(request.user)

    def get_supervisor_assignments(self, request, profile):
        return get_monitoring_queryset(
            request.user,
            {
                'role': 'SUPERVISOR',
                'profile': profile,
                'branch_id': profile.branch_id,
                'branch_name': profile.branch.name,
            },
        )

    def get_owned_assignment(
        self,
        request,
        profile,
        assignment_id,
        lock=False,
    ):
        queryset = self.get_supervisor_assignments(
            request,
            profile,
        )

        if lock:
            queryset = queryset.select_for_update(of=('self',))

        return get_object_or_404(
            queryset,
            pk=assignment_id,
        )


# --------------------------------------------------
# MONITOR ASSIGNMENTS
# SUPERVISOR / ADMIN / OWNER
# --------------------------------------------------

class SupervisorMonitorAssignmentsView(APIView):
    """
    SUPERVISOR: assignments created by that supervisor.
    ADMIN: all assignments in the admin's branch.
    OWNER: assignments across all branches.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        access = get_monitoring_access(request.user)

        queryset = get_monitoring_queryset(
            request.user,
            access,
        )

        assignment_filter = request.query_params.get(
            'status',
            'ALL',
        ).upper()

        if assignment_filter == 'ACTIVE':
            queryset = queryset.filter(
                is_active=True,
                completed_at__isnull=True,
            )

        elif assignment_filter == 'COMPLETED':
            queryset = queryset.filter(
                completed_at__isnull=False,
            )

        elif assignment_filter == 'REMOVED':
            queryset = queryset.filter(
                is_active=False,
            )

        elif assignment_filter != 'ALL':
            raise ValidationError({
                'status': (
                    'Choose ALL, ACTIVE, COMPLETED or REMOVED.'
                )
            })

        shift_filter = get_shift_filter(request)
        queryset = apply_shift_filter(queryset, shift_filter)

        search = request.query_params.get(
            'search',
            '',
        ).strip()

        if search:
            queryset = queryset.filter(
                Q(
                    visit_service__visit__vehicle__registration_number__icontains=search
                )
                | Q(
                    visit_service__visit__vehicle__make_model__icontains=search
                )
                | Q(
                    visit_service__service_name__icontains=search
                )
                | Q(
                    staff__staff_number__icontains=search
                )
                | Q(
                    staff__user__first_name__icontains=search
                )
                | Q(
                    staff__user__last_name__icontains=search
                )
            )

        assignments = queryset.order_by(
            '-assigned_at',
            '-pk',
        )

        return Response({
            'role': access['role'],
            'branch_id': access['branch_id'],
            'branch_name': access['branch_name'],
            'status_filter': assignment_filter,
            'shift_filter': shift_filter,
            'count': assignments.count(),
            'assignments': MonitorAssignmentSerializer(
                assignments,
                many=True,
            ).data,
        })


# --------------------------------------------------
# SUPERVISOR REASSIGN
# --------------------------------------------------

class SupervisorReassignView(SupervisorMonitorBaseView):
    """
    Reassign an active, unfinished assignment.

    The original record is marked as removed.
    A new assignment record is created for the replacement.

    The replacement inherits the original assignment's shift.
    """

    @transaction.atomic
    def post(self, request, assignment_id):
        profile = self.get_supervisor_profile(request)

        assignment = self.get_owned_assignment(
            request,
            profile,
            assignment_id,
            lock=True,
        )

        serializer = MonitorAssignmentReassignSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        if not assignment.is_active:
            raise ValidationError({
                'detail': 'A removed assignment cannot be reassigned.'
            })

        if assignment.completed_at is not None:
            raise ValidationError({
                'detail': (
                    'A completed assignment cannot be reassigned. '
                    'Its completion history must be preserved.'
                )
            })

        visit = assignment.visit_service.visit

        if visit.status in [
            Visit.Status.COMPLETED,
            Visit.Status.CANCELLED,
        ]:
            raise ValidationError({
                'detail': (
                    'Assignments cannot be changed on a completed '
                    'or cancelled visit.'
                )
            })

        new_staff_id = serializer.validated_data['new_staff_id']
        reason = serializer.validated_data['reason']

        new_staff = (
            StaffProfile.objects
            .select_related('user', 'branch')
            .filter(
                pk=new_staff_id,
                branch_id=profile.branch_id,
                employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                is_archived=False,
                user__is_active=True,
            )
            .first()
        )

        if new_staff is None:
            raise ValidationError({
                'new_staff_id': (
                    'The selected employee is not active or does not '
                    'belong to your branch.'
                )
            })

        service_category = assignment.visit_service.service_category

        if service_category == 'CAR_WASH':
            expected_role = 'CLEANER'
        elif service_category == 'DETAILING':
            expected_role = 'DETAILER'
        else:
            raise ValidationError({
                'detail': (
                    'This service does not support employee assignment.'
                )
            })

        if new_staff.user.role != expected_role:
            raise ValidationError({
                'new_staff_id': (
                    f'This service requires an employee with the '
                    f'{expected_role} role.'
                )
            })

        if new_staff.pk == assignment.staff_id:
            raise ValidationError({
                'new_staff_id': (
                    'Select a different employee to reassign this task.'
                )
            })

        already_assigned = ServiceAssignment.objects.filter(
            visit_service=assignment.visit_service,
            staff=new_staff,
            is_active=True,
        ).exists()

        if already_assigned:
            raise ValidationError({
                'new_staff_id': (
                    'This employee is already assigned to this service.'
                )
            })

        old_staff_name = (
            assignment.staff.user.get_full_name()
            or assignment.staff.user.username
        )

        new_staff_name = (
            new_staff.user.get_full_name()
            or new_staff.user.username
        )

        assignment.is_active = False
        assignment.removed_at = timezone.now()
        assignment.removed_by = request.user
        assignment.removal_reason = (
            f'Reassigned from {old_staff_name} to {new_staff_name}. '
            f'Reason: {reason}'
        )

        assignment.save(update_fields=[
            'is_active',
            'removed_at',
            'removed_by',
            'removal_reason',
        ])

        replacement = ServiceAssignment.objects.create(
            visit_service=assignment.visit_service,
            staff=new_staff,
            assigned_by=request.user,
            shift=assignment.shift,
        )

        return Response({
            'detail': 'Assignment successfully reassigned.',
            'previous_assignment': MonitorAssignmentSerializer(
                assignment,
            ).data,
            'new_assignment': MonitorAssignmentSerializer(
                replacement,
            ).data,
        }, status=status.HTTP_200_OK)


# --------------------------------------------------
# SUPERVISOR COMPLETE
# --------------------------------------------------

class SupervisorCompleteAssignmentView(SupervisorMonitorBaseView):
    """
    Supervisor confirms that an assigned employee's work is complete.
    completed_by records the supervisor who made the confirmation.
    """

    @transaction.atomic
    def post(self, request, assignment_id):
        profile = self.get_supervisor_profile(request)

        assignment = self.get_owned_assignment(
            request,
            profile,
            assignment_id,
            lock=True,
        )

        if not assignment.is_active:
            raise ValidationError({
                'detail': 'A removed assignment cannot be completed.'
            })

        if assignment.completed_at is not None:
            raise ValidationError({
                'detail': 'This assignment has already been completed.'
            })

        if assignment.visit_service.visit.status == Visit.Status.CANCELLED:
            raise ValidationError({
                'detail': 'A cancelled visit cannot be completed.'
            })

        assignment.completed_at = timezone.now()
        assignment.completed_by = request.user

        assignment.save(update_fields=[
            'completed_at',
            'completed_by',
        ])

        return Response({
            'detail': 'Assignment marked as completed by the supervisor.',
            'assignment': MonitorAssignmentSerializer(
                assignment,
            ).data,
        }, status=status.HTTP_200_OK)


# --------------------------------------------------
# SUPERVISOR REMOVE
# --------------------------------------------------

class SupervisorRemoveAssignmentView(SupervisorMonitorBaseView):
    """
    Remove an unfinished assignment created by this supervisor.
    The record is retained for audit.
    """

    @transaction.atomic
    def post(self, request, assignment_id):
        profile = self.get_supervisor_profile(request)

        assignment = self.get_owned_assignment(
            request,
            profile,
            assignment_id,
            lock=True,
        )

        serializer = MonitorAssignmentRemoveSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        if not assignment.is_active:
            raise ValidationError({
                'detail': 'This assignment has already been removed.'
            })

        if assignment.completed_at is not None:
            raise ValidationError({
                'detail': (
                    'A completed assignment cannot be removed. '
                    'Its completion history must be preserved.'
                )
            })

        assignment.is_active = False
        assignment.removed_at = timezone.now()
        assignment.removed_by = request.user
        assignment.removal_reason = serializer.validated_data['reason']

        assignment.save(update_fields=[
            'is_active',
            'removed_at',
            'removed_by',
            'removal_reason',
        ])

        return Response({
            'detail': 'Assignment successfully removed.',
            'assignment': MonitorAssignmentSerializer(
                assignment,
            ).data,
        }, status=status.HTTP_200_OK)


# --------------------------------------------------
# ADMIN / OWNER - COMPLETED ASSIGNMENT CORRECTIONS
# --------------------------------------------------

class AdminOwnerAssignmentCorrectionView(APIView):
    """
    Only ADMIN and OWNER may view correction history or correct
    completed assignments.

    ADMIN is restricted to their assigned branch.
    OWNER and superuser can access all branches.
    """

    permission_classes = [IsAuthenticated]

    def check_correction_permission(self, request):
        access = get_monitoring_access(request.user)

        if access['role'] not in {'ADMIN', 'OWNER'}:
            raise PermissionDenied(
                'Only ADMIN or OWNER can correct completed assignments.'
            )

        return access

    def get_assignment(
        self,
        assignment_id,
        access,
        lock=False,
    ):
        queryset = (
            ServiceAssignment.objects
            .select_related(
                'staff',
                'staff__user',
                'assigned_by',
                'completed_by',
                'removed_by',
                'visit_service',
                'visit_service__visit',
                'visit_service__visit__vehicle',
                'visit_service__visit__branch',
                'visit_service__service',
            )
        )

        if access['role'] == 'ADMIN':
            queryset = queryset.filter(
                visit_service__visit__branch_id=access['branch_id'],
            )

        if lock:
            queryset = queryset.select_for_update(of=('self',))

        return get_object_or_404(
            queryset,
            pk=assignment_id,
        )

    def get_correction_history(self, assignment):
        return (
            ServiceAssignmentCorrection.objects
            .select_related(
                'previous_staff',
                'previous_staff__user',
                'new_staff',
                'new_staff__user',
                'corrected_by',
            )
            .filter(assignment=assignment)
            .order_by('-created_at', '-pk')
        )

    def get(self, request, assignment_id):
        access = self.check_correction_permission(request)

        assignment = self.get_assignment(
            assignment_id,
            access,
        )

        history = self.get_correction_history(assignment)

        return Response({
            'assignment': MonitorAssignmentSerializer(
                assignment,
            ).data,
            'correction_count': history.count(),
            'corrections': AssignmentCorrectionHistorySerializer(
                history,
                many=True,
            ).data,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, assignment_id):
        access = self.check_correction_permission(request)

        assignment = self.get_assignment(
            assignment_id,
            access,
            lock=True,
        )

        serializer = AssignmentCorrectionSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        if (
            assignment.completed_at is None
            or assignment.completed_by_id is None
        ):
            raise ValidationError({
                'detail': 'Only completed assignments can be corrected.'
            })

        new_staff_id = serializer.validated_data['new_staff_id']
        reason = serializer.validated_data['reason']

        branch_id = assignment.visit_service.visit.branch_id

        new_staff = (
            StaffProfile.objects
            .select_related('user', 'branch')
            .filter(
                pk=new_staff_id,
                branch_id=branch_id,
                employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                is_archived=False,
                user__is_active=True,
            )
            .first()
        )

        if new_staff is None:
            raise ValidationError({
                'new_staff_id': (
                    'The selected employee is inactive, archived, '
                    'or does not belong to this assignment branch.'
                )
            })

        service_category = assignment.visit_service.service_category

        if service_category == 'CAR_WASH':
            expected_role = 'CLEANER'
        elif service_category == 'DETAILING':
            expected_role = 'DETAILER'
        else:
            raise ValidationError({
                'detail': (
                    'This service does not support employee assignment.'
                )
            })

        if new_staff.user.role != expected_role:
            raise ValidationError({
                'new_staff_id': (
                    f'This service requires an employee with the '
                    f'{expected_role} role.'
                )
            })

        if new_staff.pk == assignment.staff_id:
            raise ValidationError({
                'new_staff_id': (
                    'The selected employee is already recorded '
                    'on this assignment.'
                )
            })

        duplicate_assignment = (
            ServiceAssignment.objects
            .filter(
                visit_service=assignment.visit_service,
                staff=new_staff,
                is_active=True,
            )
            .exclude(pk=assignment.pk)
            .exists()
        )

        if duplicate_assignment:
            raise ValidationError({
                'new_staff_id': (
                    'This employee is already actively assigned '
                    'to the same service.'
                )
            })

        previous_staff = assignment.staff

        correction = ServiceAssignmentCorrection.objects.create(
            assignment=assignment,
            previous_staff=previous_staff,
            new_staff=new_staff,
            corrected_by=request.user,
            reason=reason,
        )

        # Update only the employee reference.
        # Preserve assignment ID, shift and completion details.
        assignment.staff = new_staff
        assignment.save(update_fields=['staff'])
        assignment.refresh_from_db()

        correction = (
            ServiceAssignmentCorrection.objects
            .select_related(
                'previous_staff',
                'previous_staff__user',
                'new_staff',
                'new_staff__user',
                'corrected_by',
            )
            .get(pk=correction.pk)
        )

        return Response({
            'detail': (
                'Completed assignment employee corrected successfully.'
            ),
            'assignment': MonitorAssignmentSerializer(
                assignment,
            ).data,
            'correction': AssignmentCorrectionHistorySerializer(
                correction,
            ).data,
        }, status=status.HTTP_200_OK)
