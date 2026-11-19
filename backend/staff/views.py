
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
    IsSupervisor,
    IsAccounts,
)

from .models import (
    StaffProfile,
    ShiftAssignment,
    StaffStatusHistory,
)

from .serializers import (
    StaffProfileSerializer,
    StaffDirectorySerializer,
    StaffAccountsDirectorySerializer,
    StaffBranchPickerSerializer,
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


def is_owner_or_superuser(user):
    return (
        user.is_superuser
        or getattr(user, 'role', None) == 'OWNER'
    )


def is_admin_or_owner(user):
    return (
        user.is_superuser
        or getattr(user, 'role', None) in ('ADMIN', 'OWNER')
    )


def ensure_admin_target_access(request, staff):
    if (
        is_admin_actor(request.user)
        and (
            staff.user.is_superuser
            or getattr(staff.user, 'role', None) == 'OWNER'
        )
    ):
        raise PermissionDenied(
            'Administrators cannot manage OWNER or superuser accounts.'
        )


def supervisor_profile_for(user):
    profile = StaffProfile.objects.filter(
        user=user,
        is_archived=False
    ).select_related('branch').first()

    if profile is None:
        raise PermissionDenied(
            'An active supervisor staff profile is required.'
        )

    return profile


def staff_queryset_for_user(user, include_archived=False):
    queryset = StaffProfile.objects.select_related(
        'user',
        'branch'
    ).prefetch_related(
        'shift_assignments'
    )

    if not include_archived:
        queryset = queryset.filter(is_archived=False)

    if is_admin_actor(user):
        queryset = queryset.exclude(
            user__is_superuser=True
        ).exclude(
            user__role='OWNER'
        )

    elif getattr(user, 'role', None) == 'SUPERVISOR' and not user.is_superuser:
        supervisor = supervisor_profile_for(user)

        queryset = queryset.filter(
            branch_id=supervisor.branch_id,
            user__role='CLEANER',
            user__is_superuser=False,
        )

    elif not is_admin_or_owner(user):
        return queryset.none()

    return queryset


def get_accessible_staff(request, staff_id, include_archived=False):
    return get_object_or_404(
        staff_queryset_for_user(
            request.user,
            include_archived=include_archived
        ),
        pk=staff_id
    )


def ensure_staff_management_access(request, staff, action=None):
    user = request.user

    if is_admin_or_owner(user):
        ensure_admin_target_access(request, staff)
        return

    if (
        getattr(user, 'role', None) == 'SUPERVISOR'
        and not user.is_superuser
    ):
        supervisor = supervisor_profile_for(user)

        if (
            staff.branch_id != supervisor.branch_id
            or staff.user.role != 'CLEANER'
            or staff.user.is_superuser
        ):
            raise PermissionDenied(
                'Supervisors may only manage cleaners in their own branch.'
            )

        if action == 'ARCHIVE':
            raise PermissionDenied(
                'Only ADMIN or OWNER users may archive staff.'
            )

        return

    raise PermissionDenied(
        'You do not have permission to manage this staff member.'
    )


class StaffListCreateView(generics.ListCreateAPIView):

    permission_classes = [
        IsAuthenticated,
        (
            IsAdminOrOwner
            | IsSupervisor
            | IsAccounts
        ),
    ]

    def get_queryset(self):
        return staff_queryset_for_user(self.request.user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffRegistrationSerializer

        if getattr(self.request.user, 'role', None) == 'ACCOUNTS':
            return StaffAccountsDirectorySerializer

        return StaffDirectorySerializer

    def create(self, request, *args, **kwargs):
        if not is_admin_or_owner(request.user):
            raise PermissionDenied(
                'Only ADMIN or OWNER users may register staff.'
            )

        return super().create(request, *args, **kwargs)


class StaffDetailView(generics.RetrieveUpdateAPIView):

    serializer_class = StaffProfileSerializer

    permission_classes = [
        IsAuthenticated,
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
    ]

    def get_queryset(self):
        return staff_queryset_for_user(self.request.user)

    def update(self, request, *args, **kwargs):
        staff = self.get_object()

        ensure_staff_management_access(request, staff)

        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        staff = self.get_object()

        ensure_staff_management_access(request, staff)

        return super().partial_update(request, *args, **kwargs)


class StaffShiftHistoryView(generics.ListAPIView):

    serializer_class = ShiftAssignmentSerializer

    permission_classes = [
        IsAuthenticated,
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
    ]

    def get_queryset(self):
        staff = get_accessible_staff(
            self.request,
            self.kwargs['staff_id']
        )

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
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
    ]

    def post(self, request, staff_id):
        staff = get_accessible_staff(request, staff_id)

        ensure_staff_management_access(request, staff)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
    ]

    def post(self, request, staff_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data['action']
        reason = serializer.validated_data.get('reason', '')

        with transaction.atomic():
            staff = get_object_or_404(
                staff_queryset_for_user(
                    request.user,
                    include_archived=True
                ).select_for_update(),
                pk=staff_id
            )

            ensure_staff_management_access(
                request,
                staff,
                action=action
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
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
    ]

    def get_queryset(self):
        staff = get_accessible_staff(
            self.request,
            self.kwargs['staff_id'],
            include_archived=True
        )

        return StaffStatusHistory.objects.filter(
            staff=staff
        ).select_related(
            'staff',
            'staff__user',
            'performed_by'
        )


class StaffSelfProfileView(generics.RetrieveAPIView):
    """
    Return the authenticated user's own staff profile.
    """

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
    """
    Return only operational fields needed for attendance and
    service assignment. Personal contact details are never included.

    Supervisors are restricted to their own branch.
    """

    serializer_class = StaffBranchPickerSerializer

    permission_classes = [
        IsAuthenticated,
        (
            IsAdminOrOwner
            | IsSupervisor
        ),
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

        if is_admin_actor(user):
            queryset = queryset.exclude(
                user__is_superuser=True
            ).exclude(
                user__role='OWNER'
            )

        elif (
            getattr(user, 'role', None) == 'SUPERVISOR'
            and not user.is_superuser
        ):
            supervisor = supervisor_profile_for(user)

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
