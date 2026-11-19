
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError as DRFValidationError,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import (
    IsAdminOrOwner,
    IsStaffManager,
    IsSupervisor,
)

from .models import (
    StaffProfile,
    ShiftAssignment,
    StaffStatusHistory,
)

from .serializers import (
    StaffProfileSerializer,
    StaffRegistrationSerializer,
    ShiftAssignmentSerializer,
    ShiftChangeSerializer,
    StaffStatusActionSerializer,
    StaffStatusHistorySerializer,
)

from .services import assign_staff_shift

def is_admin_actor(user):
    return (
        not user.is_superuser
        and getattr(user, 'role', None) == 'ADMIN'
    )

def is_supervisor_actor(user):
    return (
        not user.is_superuser
        and getattr(user, 'role', None) == 'SUPERVISOR'
    )

def is_protected_owner_account(user):
    return (
        user.is_superuser
        or getattr(user, 'role', None) == 'OWNER'
    )

def get_supervisor_profile(user):
    profile = StaffProfile.objects.filter(
        user=user,
        is_archived=False,
        employment_status=StaffProfile.EmploymentStatus.ACTIVE,
    ).select_related('branch').first()

    if profile is None:
        raise PermissionDenied(
            'An active supervisor staff profile is required.'
        )

    return profile

def ensure_staff_target_access(request, staff):
    user = request.user

    if (
        is_admin_actor(user)
        and is_protected_owner_account(staff.user)
    ):
        raise PermissionDenied(
            'Administrators cannot manage OWNER or superuser accounts.'
        )

    if is_supervisor_actor(user):
        supervisor = get_supervisor_profile(user)

        if staff.user.role != 'CLEANER':
            raise PermissionDenied(
                'Supervisors can only manage cleaners.'
            )

        if staff.branch_id != supervisor.branch_id:
            raise PermissionDenied(
                'You can only manage cleaners in your assigned branch.'
            )

def staff_queryset_for_user(user):
    queryset = StaffProfile.objects.select_related(
        'user',
        'branch'
    ).prefetch_related(
        'shift_assignments'
    ).filter(
        is_archived=False
    )

    if is_admin_actor(user):
        queryset = queryset.exclude(
            user__is_superuser=True
        ).exclude(
            user__role='OWNER'
        )

    elif is_supervisor_actor(user):
        supervisor = get_supervisor_profile(user)

        queryset = queryset.filter(
            user__role='CLEANER',
            branch_id=supervisor.branch_id,
        )

    return queryset

class StaffListCreateView(generics.ListCreateAPIView):

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def get_queryset(self):
        return staff_queryset_for_user(self.request.user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffRegistrationSerializer

        return StaffProfileSerializer

class StaffDetailView(generics.RetrieveUpdateAPIView):

    serializer_class = StaffProfileSerializer

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def get_queryset(self):
        return staff_queryset_for_user(self.request.user)

class StaffShiftHistoryView(generics.ListAPIView):

    serializer_class = ShiftAssignmentSerializer

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def get_queryset(self):
        staff = get_object_or_404(
            StaffProfile.objects.select_related('user', 'branch'),
            pk=self.kwargs['staff_id'],
            is_archived=False
        )

        ensure_staff_target_access(self.request, staff)

        return ShiftAssignment.objects.filter(
            staff=staff
        ).select_related(
            'staff',
            'staff__user',
            'changed_by'
        )

class StaffShiftChangeView(generics.GenericAPIView):

    serializer_class = ShiftChangeSerializer

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def post(self, request, staff_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        staff = get_object_or_404(
            StaffProfile.objects.select_related('user', 'branch'),
            pk=staff_id,
            is_archived=False
        )

        ensure_staff_target_access(request, staff)

        try:
            assignment = assign_staff_shift(
                staff_id=staff_id,
                shift=serializer.validated_data['shift'],
                effective_from=serializer.validated_data['effective_from'],
                changed_by=request.user,
                reason=serializer.validated_data.get('reason', '')
            )

        except StaffProfile.DoesNotExist:
            return Response(
                {'detail': 'Staff member not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        except ValidationError as error:
            raise DRFValidationError(error.messages)

        return Response(
            ShiftAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED
        )

class StaffStatusActionView(generics.GenericAPIView):

    serializer_class = StaffStatusActionSerializer

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def post(self, request, staff_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data['action']
        reason = serializer.validated_data.get('reason', '')

        with transaction.atomic():
            staff = get_object_or_404(
                StaffProfile.objects.select_for_update().select_related(
                    'user',
                    'branch'
                ),
                pk=staff_id
            )

            ensure_staff_target_access(request, staff)

            if is_supervisor_actor(request.user) and action == 'ARCHIVE':
                raise PermissionDenied(
                    'Supervisors are not permitted to archive cleaners.'
                )

            if staff.user_id == request.user.id and action in (
                'DEACTIVATE',
                'SUSPEND',
                'ARCHIVE',
            ):
                raise DRFValidationError({
                    'detail': (
                        'You cannot deactivate, suspend or archive '
                        'your own account.'
                    )
                })

            if staff.is_archived:
                return Response(
                    {
                        'detail': (
                            'This staff member is archived. '
                            'Archived staff cannot be activated '
                            'or changed through this endpoint.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            if action == 'ACTIVATE':
                if (
                    staff.employment_status
                    == StaffProfile.EmploymentStatus.ACTIVE
                    and staff.user.is_active
                ):
                    return Response(
                        {'detail': 'This staff member is already active.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                staff.employment_status = (
                    StaffProfile.EmploymentStatus.ACTIVE
                )
                staff.user.is_active = True
                staff.user.save(update_fields=['is_active'])

                history_action = StaffStatusHistory.Action.ACTIVATED

            elif action == 'DEACTIVATE':
                if (
                    staff.employment_status
                    == StaffProfile.EmploymentStatus.INACTIVE
                    and not staff.user.is_active
                ):
                    return Response(
                        {'detail': 'This staff member is already inactive.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                staff.employment_status = (
                    StaffProfile.EmploymentStatus.INACTIVE
                )
                staff.user.is_active = False
                staff.user.save(update_fields=['is_active'])

                history_action = StaffStatusHistory.Action.DEACTIVATED

            elif action == 'SUSPEND':
                if (
                    staff.employment_status
                    == StaffProfile.EmploymentStatus.SUSPENDED
                    and not staff.user.is_active
                ):
                    return Response(
                        {'detail': 'This staff member is already suspended.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                staff.employment_status = (
                    StaffProfile.EmploymentStatus.SUSPENDED
                )
                staff.user.is_active = False
                staff.user.save(update_fields=['is_active'])

                history_action = StaffStatusHistory.Action.SUSPENDED

            elif action == 'ARCHIVE':
                staff.employment_status = (
                    StaffProfile.EmploymentStatus.INACTIVE
                )
                staff.is_archived = True
                staff.archived_at = timezone.now()
                staff.archived_by = request.user

                staff.user.is_active = False
                staff.user.save(update_fields=['is_active'])

                history_action = StaffStatusHistory.Action.ARCHIVED

            else:
                raise DRFValidationError({
                    'action': 'Unsupported staff status action.'
                })

            staff.save()

            StaffStatusHistory.objects.create(
                staff=staff,
                action=history_action,
                performed_by=request.user,
                reason=reason
            )

        messages = {
            'ACTIVATE': 'Staff member successfully activated.',
            'DEACTIVATE': 'Staff member successfully deactivated.',
            'SUSPEND': 'Staff member successfully suspended.',
            'ARCHIVE': 'Staff member successfully archived.',
        }

        return Response(
            {
                'detail': messages[action],
                'staff': StaffProfileSerializer(
                    staff,
                    context={'request': request}
                ).data
            },
            status=status.HTTP_200_OK
        )

class StaffStatusHistoryView(generics.ListAPIView):

    serializer_class = StaffStatusHistorySerializer

    permission_classes = [
        IsAuthenticated,
        IsStaffManager,
    ]

    def get_queryset(self):
        staff = get_object_or_404(
            StaffProfile.objects.select_related('user', 'branch'),
            pk=self.kwargs['staff_id']
        )

        ensure_staff_target_access(self.request, staff)

        return StaffStatusHistory.objects.filter(
            staff=staff
        ).select_related(
            'staff',
            'staff__user',
            'performed_by'
        )

class StaffSelfProfileView(generics.RetrieveAPIView):

    serializer_class = StaffProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StaffProfile.objects.select_related(
            'user',
            'branch'
        ).prefetch_related(
            'shift_assignments'
        ).filter(
            user=self.request.user,
            is_archived=False
        )

    def get_object(self):
        return get_object_or_404(self.get_queryset())

class StaffBranchPickerView(generics.ListAPIView):

    serializer_class = StaffProfileSerializer

    permission_classes = [
        IsAuthenticated,
        (IsAdminOrOwner | IsSupervisor),
    ]

    def get_queryset(self):
        user = self.request.user

        queryset = StaffProfile.objects.select_related(
            'user',
            'branch'
        ).prefetch_related(
            'shift_assignments'
        ).filter(
            is_archived=False,
            employment_status=StaffProfile.EmploymentStatus.ACTIVE,
            user__is_active=True,
        )

        if is_supervisor_actor(user):
            supervisor = get_supervisor_profile(user)

            queryset = queryset.filter(
                branch_id=supervisor.branch_id
            )

        else:
            branch_id = self.request.query_params.get('branch_id')

            if branch_id:
                if not branch_id.isdigit():
                    raise DRFValidationError({
                        'branch_id': 'A valid branch ID is required.'
                    })

                queryset = queryset.filter(
                    branch_id=int(branch_id)
                )

        return queryset.order_by('staff_number')