from django.core.exceptions import ValidationError as DjangoValidationError

from payments.workflows import complete_visit_and_generate_invoice
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import (
    IsAdmin,
    IsAdminOrOwner,
    IsSupervisor,
    IsDetailer,
)

from staff.models import StaffProfile, ShiftAssignment

from .models import Visit, VisitService, ServiceAssignment
from .serializers import (
    VisitSerializer,
    VisitServiceSerializer,
    ServiceAssignmentSerializer,
    MyDayAssignmentSerializer,
    ServiceAssignmentRemovalSerializer,
)


def get_active_staff_profile(user):
    """Return the authenticated user's active staff profile."""

    try:
        staff = StaffProfile.objects.select_related(
            'branch',
            'user',
        ).get(user=user)
    except StaffProfile.DoesNotExist:
        raise PermissionDenied(
            'Your account is not linked to a staff profile.'
        )

    if (
        staff.employment_status != StaffProfile.EmploymentStatus.ACTIVE
        or staff.is_archived
        or not staff.user.is_active
    ):
        raise PermissionDenied(
            'Your staff profile is not active.'
        )

    if not staff.branch.is_active:
        raise PermissionDenied(
            'Your assigned branch is inactive.'
        )

    return staff


class MyDayView(APIView):
    """
    Personal daily assignments, completion summary and
    anonymized branch cleaner leaderboard.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'role', None) != 'CLEANER':
            raise PermissionDenied(
                'MyDay is available to cleaner accounts only.'
            )

        staff = get_active_staff_profile(request.user)
        today = timezone.localdate()

        # Include today's assignments, assignments completed today,
        # and unfinished active assignments carried over from an
        # earlier visit.
        assignments = (
            ServiceAssignment.objects
            .filter(
                staff=staff,
                visit_service__visit__branch_id=staff.branch_id,
            )
            .filter(
                Q(assigned_at__date=today)
                | Q(visit_service__visit__arrival_time__date=today)
                | Q(completed_at__date=today)
                | Q(
                    is_active=True,
                    completed_at__isnull=True,
                    visit_service__visit__status__in=[
                        Visit.Status.CHECKED_IN,
                        Visit.Status.IN_PROGRESS,
                    ],
                )
            )
            .select_related(
                'visit_service',
                'visit_service__visit',
                'visit_service__visit__vehicle',
            )
            .order_by('-assigned_at')
        )

        assigned_today = ServiceAssignment.objects.filter(
            staff=staff,
            visit_service__visit__branch_id=staff.branch_id,
            assigned_at__date=today,
        ).count()

        completed_today = ServiceAssignment.objects.filter(
            staff=staff,
            visit_service__visit__branch_id=staff.branch_id,
            completed_at__date=today,
        ).count()

        completed_from_today_assignments = ServiceAssignment.objects.filter(
            staff=staff,
            visit_service__visit__branch_id=staff.branch_id,
            assigned_at__date=today,
            completed_at__date=today,
        ).count()

        pending_assignments = assignments.filter(
            is_active=True,
            completed_at__isnull=True,
        ).count()

        completion_rate = None

        if assigned_today:
            completion_rate = round(
                completed_from_today_assignments
                / assigned_today
                * 100,
                1,
            )

        # Get the cleaner's effective shift assignment for today.
        shift_assignment = (
            ShiftAssignment.objects
            .filter(
                staff=staff,
                effective_from__lte=today,
            )
            .filter(
                Q(effective_to__isnull=True)
                | Q(effective_to__gte=today)
            )
            .order_by('-effective_from')
            .first()
        )

        # Include all active cleaners at this branch, even if they
        # have completed zero assignments today.
        #
        # Only aggregate counts are returned to the frontend.
        leaderboard_records = list(
            StaffProfile.objects
            .filter(
                branch_id=staff.branch_id,
                employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                is_archived=False,
                user__is_active=True,
                user__role='CLEANER',
            )
            .annotate(
                completed_today=Count(
                    'service_assignments',
                    filter=Q(
                        service_assignments__completed_at__date=today,
                        service_assignments__visit_service__visit__branch_id=(
                            staff.branch_id
                        ),
                    ),
                )
            )
            .values('id', 'completed_today')
            .order_by('-completed_today', 'id')
        )

        leaderboard = []
        current_rank = None
        previous_count = None
        anonymous_number = 0
        my_rank = None

        for position, item in enumerate(
            leaderboard_records,
            start=1,
        ):
            completed_count = item['completed_today']

            # Competition ranking: 1, 2, 2, 4.
            if completed_count != previous_count:
                current_rank = position
                previous_count = completed_count

            is_current_user = item['id'] == staff.pk

            if is_current_user:
                label = 'You'
                my_rank = current_rank
            else:
                anonymous_number += 1
                label = f'Cleaner {anonymous_number}'

            leaderboard.append({
                'rank': current_rank,
                'label': label,
                'completed_assignments': completed_count,
                'is_current_user': is_current_user,
            })

        # Commission is intentionally not estimated from catalogue
        # prices. The current system has no final vehicle bill or
        # bargaining-discount record from which to calculate it.
        commission_summary = {
            'amount': None,
            'currency': 'KES',
            'status': 'BILLING_DATA_REQUIRED',
            'message': (
                'Commission will be displayed when the vehicle billing '
                'and discount records are connected to the commission '
                'calculation.'
            ),
        }

        return Response({
            'date': today.isoformat(),
            'branch_name': staff.branch.name,
            'shift': (
                shift_assignment.shift
                if shift_assignment else None
            ),
            'summary': {
                'assigned_today': assigned_today,
                'completed_today': completed_today,
                'pending_assignments': pending_assignments,
                'completion_rate': completion_rate,
            },
            'commission': commission_summary,
            'assignments': MyDayAssignmentSerializer(
                assignments,
                many=True,
            ).data,
            'leaderboard': leaderboard,
            'my_rank': my_rank,
        })


class ServiceAssignmentCompleteView(APIView):
    """
    Allow an assigned employee to confirm their own service work.

    CLEANER and DETAILER accounts may complete their own assignments.
    Other employees and managers cannot confirm work on their behalf
    through this self-service endpoint.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, assignment_id):
        role = getattr(request.user, 'role', None)

        if role not in {'CLEANER', 'DETAILER'}:
            raise PermissionDenied(
                'Only the assigned cleaner or detailer can confirm '
                'their own service completion.'
            )

        staff = get_active_staff_profile(request.user)

        assignment = get_object_or_404(
            ServiceAssignment.objects
            .select_for_update()
            .select_related(
                'staff',
                'visit_service',
                'visit_service__visit',
            ),
            pk=assignment_id,
            staff=staff,
            visit_service__visit__branch_id=staff.branch_id,
        )

        if assignment.completed_at is not None:
            raise ValidationError({
                'detail': 'This assignment has already been completed.'
            })

        if not assignment.is_active:
            raise ValidationError({
                'detail': (
                    'This assignment is no longer active. '
                    'Please contact your supervisor.'
                )
            })

        if assignment.visit_service.visit.status == Visit.Status.CANCELLED:
            raise ValidationError({
                'detail': 'A cancelled visit cannot be completed.'
            })

        assignment.completed_at = timezone.now()
        assignment.completed_by = request.user

        assignment.save(
            update_fields=[
                'completed_at',
                'completed_by',
            ]
        )

        return Response(
            {
                'detail': 'Your assignment has been marked as completed.',
                'assignment': MyDayAssignmentSerializer(
                    assignment,
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class VisitListCreateView(generics.ListCreateAPIView):
    serializer_class = VisitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        queryset = Visit.objects.select_related(
            'vehicle',
            'branch',
            'checked_in_by',
        )

        if user.is_superuser or user.role in ['ADMIN', 'OWNER']:
            return queryset.all()

        if hasattr(user, 'staff_profile'):
            return queryset.filter(
                branch=user.staff_profile.branch
            )

        return queryset.none()

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                (IsAdminOrOwner | IsSupervisor | IsDetailer)(),
            ]

        return super().get_permissions()


class VisitDetailView(generics.RetrieveAPIView):
    serializer_class = VisitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        queryset = Visit.objects.select_related(
            'vehicle',
            'branch',
            'checked_in_by',
        )

        if user.is_superuser or user.role in ['ADMIN', 'OWNER']:
            return queryset.all()

        if hasattr(user, 'staff_profile'):
            return queryset.filter(
                branch=user.staff_profile.branch
            )

        return queryset.none()


class VisitServiceListCreateView(generics.ListCreateAPIView):
    serializer_class = VisitServiceSerializer
    permission_classes = [IsAuthenticated]

    def get_visit(self):
        user = self.request.user

        queryset = Visit.objects.all()

        if not user.is_superuser and user.role not in ['ADMIN', 'OWNER']:
            if not hasattr(user, 'staff_profile'):
                queryset = queryset.none()
            else:
                queryset = queryset.filter(
                    branch=user.staff_profile.branch
                )

        return get_object_or_404(
            queryset,
            pk=self.kwargs['visit_id'],
        )

    def get_queryset(self):
        visit = self.get_visit()

        return VisitService.objects.filter(
            visit=visit
        ).select_related(
            'service',
            'added_by',
        )

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                (IsAdmin | IsSupervisor | IsDetailer)(),
            ]

        return super().get_permissions()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['visit'] = self.get_visit()
        return context

    def perform_create(self, serializer):
        visit = self.get_visit()

        if visit.status in [
            Visit.Status.COMPLETED,
            Visit.Status.CANCELLED,
        ]:
            raise ValidationError(
                "Services cannot be added to a completed or cancelled visit."
            )

        serializer.save()


class ServiceAssignmentListCreateView(generics.ListCreateAPIView):
    serializer_class = ServiceAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_visit_service(self):
        user = self.request.user

        queryset = VisitService.objects.select_related(
            'visit',
            'service',
        ).filter(
            visit_id=self.kwargs['visit_id'],
            pk=self.kwargs['visit_service_id'],
        )

        if not user.is_superuser and user.role not in ['ADMIN', 'OWNER']:
            if not hasattr(user, 'staff_profile'):
                queryset = queryset.none()
            else:
                queryset = queryset.filter(
                    visit__branch=user.staff_profile.branch
                )

        return get_object_or_404(queryset)

    def get_queryset(self):
        visit_service = self.get_visit_service()

        return ServiceAssignment.objects.filter(
            visit_service=visit_service
        ).select_related(
            'staff',
            'staff__user',
            'assigned_by',
            'removed_by',
            'completed_by',
        )

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                (IsAdmin | IsSupervisor)(),
            ]

        return super().get_permissions()

    def perform_create(self, serializer):
        visit_service = self.get_visit_service()
        visit = visit_service.visit
        staff = serializer.validated_data['staff']
        user = self.request.user

        if visit.status in [
            Visit.Status.COMPLETED,
            Visit.Status.CANCELLED,
        ]:
            raise ValidationError(
                "Staff cannot be assigned to a completed or cancelled visit."
            )

        if staff.employment_status != staff.EmploymentStatus.ACTIVE:
            raise ValidationError(
                "Inactive or suspended staff cannot be assigned."
            )

        if not staff.user.is_active:
            raise ValidationError(
                "This staff member's user account is inactive."
            )

        if staff.branch_id != visit.branch_id:
            raise ValidationError(
                "Staff can only be assigned to visits at their own branch."
            )

        if visit_service.service_category == 'CAR_WASH':
            expected_role = 'CLEANER'
        elif visit_service.service_category == 'DETAILING':
            expected_role = 'DETAILER'
        else:
            raise ValidationError(
                "The service category does not support staff assignment."
            )

        if staff.user.role != expected_role:
            raise ValidationError(
                f"Only staff with the {expected_role} role can be assigned "
                f"to this service."
            )

        already_assigned = ServiceAssignment.objects.filter(
            visit_service=visit_service,
            staff=staff,
            is_active=True,
        ).exists()

        if already_assigned:
            raise ValidationError(
                "This staff member is already assigned to this service."
            )

        serializer.save(
            visit_service=visit_service,
            assigned_by=user,
        )


class ServiceAssignmentRemoveView(generics.GenericAPIView):
    serializer_class = ServiceAssignmentRemovalSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [
            IsAuthenticated(),
            (IsAdmin | IsSupervisor)(),
        ]

    def post(self, request, visit_id, visit_service_id, assignment_id):
        user = request.user

        queryset = VisitService.objects.select_related(
            'visit'
        ).filter(
            pk=visit_service_id,
            visit_id=visit_id,
        )

        if not user.is_superuser and user.role not in ['ADMIN', 'OWNER']:
            if not hasattr(user, 'staff_profile'):
                raise ValidationError(
                    "You do not have permission to remove this assignment."
                )

            queryset = queryset.filter(
                visit__branch=user.staff_profile.branch
            )

        visit_service = get_object_or_404(queryset)

        assignment = get_object_or_404(
            ServiceAssignment,
            pk=assignment_id,
            visit_service=visit_service,
            is_active=True,
        )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        assignment.is_active = False
        assignment.removed_at = timezone.now()
        assignment.removed_by = user
        assignment.removal_reason = serializer.validated_data[
            'removal_reason'
        ]

        assignment.save(update_fields=[
            'is_active',
            'removed_at',
            'removed_by',
            'removal_reason',
        ])

        return Response(
            ServiceAssignmentSerializer(assignment).data,
            status=status.HTTP_200_OK,
        )



class VisitCompleteView(APIView):
    """
    Complete a visit and generate its invoice in one transaction.

    ADMIN, OWNER and SUPERVISOR can complete visits.
    Supervisors are restricted to their assigned branch.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, visit_id):
        user = request.user
        role = getattr(user, 'role', None)

        if not user.is_superuser and role not in {
            'ADMIN',
            'OWNER',
            'SUPERVISOR',
        }:
            raise PermissionDenied(
                'You are not permitted to complete visits.'
            )

        queryset = Visit.objects.select_related(
            'vehicle',
            'branch',
        )

        if not user.is_superuser and role == 'SUPERVISOR':
            staff = get_active_staff_profile(user)
            queryset = queryset.filter(branch_id=staff.branch_id)

        visit = get_object_or_404(
            queryset,
            pk=visit_id,
        )

        bargaining_discount = request.data.get(
            'bargaining_discount',
            '0.00',
        )

        discount_reason = request.data.get(
            'discount_reason',
            '',
        )

        loyalty_discounts = request.data.get(
            'loyalty_discounts',
            {},
        )

        if not isinstance(discount_reason, str):
            raise ValidationError({
                'discount_reason': 'Enter a valid discount reason.'
            })

        try:
            invoice = complete_visit_and_generate_invoice(
                visit_id=visit.pk,
                user=user,
                bargaining_discount=bargaining_discount,
                discount_reason=discount_reason,
                loyalty_discounts=loyalty_discounts,
            )
        except DjangoValidationError as exc:
            if hasattr(exc, 'message_dict'):
                detail = exc.message_dict
            else:
                detail = exc.messages

            raise ValidationError(detail)

        lines = invoice.lines.all()

        return Response(
            {
                'detail': 'Visit completed and invoice issued successfully.',
                'visit': {
                    'id': visit.pk,
                    'status': Visit.Status.COMPLETED,
                    'completed_at': (
                        visit.completed_at.isoformat()
                        if visit.completed_at
                        else None
                    ),
                },
                'invoice': {
                    'id': invoice.pk,
                    'invoice_number': invoice.invoice_number,
                    'status': invoice.status,
                    'branch_name': invoice.branch_name,
                    'customer_name': invoice.customer_name,
                    'customer_phone': invoice.customer_phone,
                    'subtotal': str(invoice.subtotal),
                    'bargaining_discount_total': str(
                        invoice.bargaining_discount_total
                    ),
                    'loyalty_discount_total': str(
                        invoice.loyalty_discount_total
                    ),
                    'discount_amount': str(invoice.discount_amount),
                    'taxable_amount': str(invoice.taxable_amount),
                    'vat_rate': (
                        str(invoice.vat_rate)
                        if invoice.vat_rate is not None
                        else None
                    ),
                    'vat_amount': str(invoice.vat_amount),
                    'total_amount': str(invoice.total_amount),
                    'commission_base_amount': str(
                        invoice.commission_base_amount
                    ),
                    'lines': [
                        {
                            'visit_service_id': line.visit_service_id,
                            'service_name': line.service_name,
                            'quantity': line.quantity,
                            'unit_price': str(line.unit_price),
                            'bargaining_discount': str(
                                line.bargaining_discount
                            ),
                            'loyalty_discount': str(
                                line.loyalty_discount
                            ),
                            'taxable_amount': str(line.taxable_amount),
                            'vat_amount': str(line.vat_amount),
                            'line_total': str(line.line_total),
                            'commission_base_amount': str(
                                line.commission_base_amount
                            ),
                        }
                        for line in lines
                    ],
                },
            },
            status=status.HTTP_201_CREATED,
        )
