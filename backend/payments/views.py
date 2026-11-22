
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from branches.models import Branch
from payments.models import (
    Invoice,
    PaymentCollection,
    PaymentEntry,
    PaymentReversal,
    CleanerCommission,
    CommissionPayout,
    CommissionAdjustment,
    BranchTaxConfiguration,
)
from payments.serializers import (
    InvoiceReadSerializer,
    PaymentCollectionCreateSerializer,
    PaymentCollectionReadSerializer,
    PaymentReversalCreateSerializer,
    PaymentReversalReadSerializer,
    CleanerCommissionReadSerializer,
    CommissionPayoutReadSerializer,
    CommissionPayoutCreateSerializer,
    CommissionAdjustmentReadSerializer,
    CommissionAdjustmentCreateSerializer,
    BranchTaxConfigurationReadSerializer,
    BranchTaxConfigurationCreateSerializer,
)
from payments.workflows import (
    record_payment_collection,
    reverse_payment,
)
from staff.models import StaffProfile

GLOBAL_PAYMENT_ROLES = {
    User.Role.OWNER,
    User.Role.ADMIN,
    User.Role.ACCOUNTS,
}

PAYMENT_VIEW_ROLES = GLOBAL_PAYMENT_ROLES | {
    User.Role.SUPERVISOR,
}

REVERSAL_ROLES = GLOBAL_PAYMENT_ROLES

COMMISSION_READ_ROLES = {
    User.Role.OWNER,
    User.Role.ADMIN,
    User.Role.ACCOUNTS,
    User.Role.SUPERVISOR,
    User.Role.CLEANER,
}

COMMISSION_PAYOUT_WRITE_ROLES = GLOBAL_PAYMENT_ROLES

COMMISSION_ADJUSTMENT_WRITE_ROLES = {
    User.Role.OWNER,
    User.Role.ADMIN,
}

def get_supervisor_branch(user):
    profile = (
        StaffProfile.objects
        .select_related('branch', 'user')
        .filter(user=user)
        .first()
    )

    if (
        not profile
        or profile.employment_status != 'ACTIVE'
        or profile.is_archived
        or not profile.branch
        or not profile.branch.is_active
        or not user.is_active
    ):
        raise PermissionDenied(
            'An active staff profile and branch are required.'
        )

    return profile.branch

def get_cleaner_profile(user):
    profile = (
        StaffProfile.objects
        .select_related('branch', 'user')
        .filter(user=user)
        .first()
    )

    if (
        not profile
        or profile.user.role != User.Role.CLEANER
        or profile.employment_status != 'ACTIVE'
        or profile.is_archived
        or not profile.branch
        or not user.is_active
    ):
        raise PermissionDenied(
            'An active cleaner staff profile is required.'
        )

    return profile

def ensure_payment_view_access(user):
    if user.is_superuser:
        return

    if user.role not in PAYMENT_VIEW_ROLES:
        raise PermissionDenied(
            'You do not have permission to access payment records.'
        )

def ensure_reversal_access(user):
    if user.is_superuser:
        return

    if user.role not in REVERSAL_ROLES:
        raise PermissionDenied(
            'Only OWNER, ADMIN or ACCOUNTS can reverse payments.'
        )

def ensure_commission_read_access(user):
    if user.is_superuser:
        return

    if user.role not in COMMISSION_READ_ROLES:
        raise PermissionDenied(
            'You do not have permission to view commission records.'
        )

def ensure_payout_write_access(user):
    if user.is_superuser:
        return

    if user.role not in COMMISSION_PAYOUT_WRITE_ROLES:
        raise PermissionDenied(
            'Only OWNER, ADMIN and ACCOUNTS can record commission payouts.'
        )

def ensure_adjustment_write_access(user):
    if user.is_superuser:
        return

    if user.role not in COMMISSION_ADJUSTMENT_WRITE_ROLES:
        raise PermissionDenied(
            'Only OWNER and ADMIN can adjust earned commissions.'
        )
def ensure_tax_configuration_access(user):
    if user.is_superuser:
        return

    if (
        not user.is_active
        or user.role not in {
            User.Role.OWNER,
            User.Role.ADMIN,
        }
    ):
        raise PermissionDenied(
            'Only OWNER and ADMIN can manage VAT configuration.'
        )

def get_accessible_invoice_queryset(user):
    queryset = Invoice.objects.select_related(
        'branch',
        'customer',
        'visit',
        'created_by',
        'issued_by',
    ).prefetch_related('lines')

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        return queryset.filter(branch=get_supervisor_branch(user))

    raise PermissionDenied(
        'You do not have permission to access these invoices.'
    )

def get_accessible_collection_queryset(user):
    queryset = PaymentCollection.objects.select_related(
        'invoice',
        'invoice__branch',
        'received_by',
    ).prefetch_related(
        'entries',
        'entries__reversals',
        'invoice__lines',
    )

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        return queryset.filter(
            invoice__branch=get_supervisor_branch(user)
        )

    raise PermissionDenied(
        'You do not have permission to access payment collections.'
    )

def get_accessible_commission_queryset(user):
    queryset = CleanerCommission.objects.select_related(
        'staff',
        'staff__user',
        'branch',
        'visit',
        'visit_service',
        'invoice_line',
        'invoice_line__invoice',
        'assignment',
    ).prefetch_related('adjustments')

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        branch = get_supervisor_branch(user)
        return queryset.filter(branch=branch)

    if user.role == User.Role.CLEANER:
        profile = get_cleaner_profile(user)
        return queryset.filter(staff=profile)

    raise PermissionDenied(
        'You do not have permission to access commission records.'
    )

def get_accessible_payout_queryset(user):
    queryset = CommissionPayout.objects.select_related(
        'staff',
        'staff__user',
        'branch',
        'recorded_by',
    )

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        return queryset.filter(branch=get_supervisor_branch(user))

    if user.role == User.Role.CLEANER:
        return queryset.filter(staff=get_cleaner_profile(user))

    raise PermissionDenied(
        'You do not have permission to access payout records.'
    )

def get_accessible_adjustment_queryset(user):
    queryset = CommissionAdjustment.objects.select_related(
        'commission',
        'commission__staff',
        'commission__branch',
        'adjusted_by',
    )

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        return queryset.filter(
            commission__branch=get_supervisor_branch(user)
        )

    if user.role == User.Role.CLEANER:
        return queryset.filter(
            commission__staff=get_cleaner_profile(user)
        )

    raise PermissionDenied(
        'You do not have permission to access adjustment records.'
    )

def convert_workflow_validation_error(exc):
    if hasattr(exc, 'message_dict'):
        detail = exc.message_dict
    elif hasattr(exc, 'messages'):
        detail = exc.messages
    else:
        detail = str(exc)

    raise ValidationError(detail)

def get_operational_window(work_date):
    current_tz = timezone.get_current_timezone()

    start = timezone.make_aware(
        datetime.combine(work_date, time(7, 0)),
        current_tz,
    )
    end = start + timedelta(days=1)

    return start, end

def get_default_operational_date():
    local_now = timezone.localtime()
    current_date = local_now.date()

    if local_now.time().replace(tzinfo=None) < time(7, 0):
        return current_date - timedelta(days=1)

    return current_date

def get_revenue_report_date(request):
    raw_date = request.query_params.get('work_date')

    if not raw_date:
        return get_default_operational_date()

    work_date = parse_date(raw_date)

    if work_date is None:
        raise ValidationError({
            'work_date': 'Use the YYYY-MM-DD date format.'
        })

    return work_date

def get_optional_date_filter(request, parameter):
    raw_value = request.query_params.get(parameter)

    if not raw_value:
        return None

    parsed = parse_date(raw_value)

    if parsed is None:
        raise ValidationError({
            parameter: 'Use the YYYY-MM-DD date format.'
        })

    return parsed

def apply_date_filters(queryset, request, field):
    date_from = get_optional_date_filter(request, 'date_from')
    date_to = get_optional_date_filter(request, 'date_to')

    if date_from and date_to and date_from > date_to:
        raise ValidationError({
            'date_to': 'The end date cannot be before the start date.'
        })

    if date_from:
        queryset = queryset.filter(**{
            f'{field}__date__gte': date_from,
        })

    if date_to:
        queryset = queryset.filter(**{
            f'{field}__date__lte': date_to,
        })

    return queryset

def money_string(value):
    return f'{value or Decimal("0.00"):.2f}'

def get_staff_branch_balance(staff_id, branch_id):
    earned = CleanerCommission.objects.filter(
        staff_id=staff_id,
        branch_id=branch_id,
    ).aggregate(total=Sum('earned_amount'))['total'] or Decimal('0.00')

    adjustments = CommissionAdjustment.objects.filter(
        commission__staff_id=staff_id,
        commission__branch_id=branch_id,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    paid = CommissionPayout.objects.filter(
        staff_id=staff_id,
        branch_id=branch_id,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    return earned + adjustments - paid

class InvoiceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_payment_view_access(request.user)
        queryset = get_accessible_invoice_queryset(request.user)

        branch_id = request.query_params.get('branch')
        invoice_status = request.query_params.get('status')
        invoice_number = request.query_params.get('invoice_number')

        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)

        if invoice_status:
            queryset = queryset.filter(status=invoice_status)

        if invoice_number:
            queryset = queryset.filter(
                invoice_number__icontains=invoice_number.strip()
            )

        serializer = InvoiceReadSerializer(
            queryset.order_by('-created_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

class InvoiceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id):
        ensure_payment_view_access(request.user)

        invoice = get_object_or_404(
            get_accessible_invoice_queryset(request.user),
            pk=invoice_id,
        )

        serializer = InvoiceReadSerializer(
            invoice,
            context={'request': request},
        )
        return Response(serializer.data)

class PaymentCollectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_payment_view_access(request.user)
        queryset = get_accessible_collection_queryset(request.user)

        invoice_id = request.query_params.get('invoice')
        receipt_number = request.query_params.get('receipt_number')

        if invoice_id:
            queryset = queryset.filter(invoice_id=invoice_id)

        if receipt_number:
            queryset = queryset.filter(
                receipt_number__icontains=receipt_number.strip()
            )

        serializer = PaymentCollectionReadSerializer(
            queryset.order_by('-created_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

class PaymentCollectionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, collection_id):
        ensure_payment_view_access(request.user)

        collection = get_object_or_404(
            get_accessible_collection_queryset(request.user),
            pk=collection_id,
        )

        serializer = PaymentCollectionReadSerializer(
            collection,
            context={'request': request},
        )
        return Response(serializer.data)

class InvoicePaymentCollectionCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, invoice_id):
        ensure_payment_view_access(request.user)

        invoice = get_object_or_404(
            get_accessible_invoice_queryset(request.user),
            pk=invoice_id,
        )

        input_serializer = PaymentCollectionCreateSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        try:
            collection = record_payment_collection(
                invoice_id=invoice.pk,
                user=request.user,
                payments=data['payments'],
                idempotency_key=data.get('idempotency_key'),
            )
        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)

        output = PaymentCollectionReadSerializer(
            collection,
            context={'request': request},
        )
        return Response(output.data, status=status.HTTP_201_CREATED)

class PaymentReversalListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_reversal_access(request.user)

        queryset = PaymentReversal.objects.select_related(
            'payment_entry',
            'payment_entry__collection',
            'payment_entry__collection__invoice',
            'payment_entry__collection__invoice__branch',
            'reversed_by',
        )

        invoice_id = request.query_params.get('invoice')
        payment_entry_id = request.query_params.get('payment_entry')

        if invoice_id:
            queryset = queryset.filter(
                payment_entry__collection__invoice_id=invoice_id
            )

        if payment_entry_id:
            queryset = queryset.filter(
                payment_entry_id=payment_entry_id
            )

        serializer = PaymentReversalReadSerializer(
            queryset.order_by('-created_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

class PaymentReversalCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, payment_entry_id):
        ensure_reversal_access(request.user)

        payment_entry = get_object_or_404(
            PaymentEntry.objects.select_related(
                'collection',
                'collection__invoice',
                'collection__invoice__branch',
            ),
            pk=payment_entry_id,
        )

        input_serializer = PaymentReversalCreateSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        try:
            reversal = reverse_payment(
                payment_entry_id=payment_entry.pk,
                amount=data['amount'],
                reason=data['reason'],
                user=request.user,
                idempotency_key=data.get('idempotency_key'),
            )
        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)

        output = PaymentReversalReadSerializer(
            reversal,
            context={'request': request},
        )
        return Response(output.data, status=status.HTTP_201_CREATED)

class SupervisorRevenueSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_payment_view_access(request.user)

        if (
            not request.user.is_superuser
            and request.user.role != User.Role.SUPERVISOR
        ):
            raise PermissionDenied(
                'This revenue summary is available to supervisors.'
            )

        if request.user.is_superuser:
            branch_id = request.query_params.get('branch')
            if not branch_id:
                raise ValidationError({
                    'branch': 'A branch ID is required for this report.'
                })
            branch = get_object_or_404(Branch, pk=branch_id)
        else:
            branch = get_supervisor_branch(request.user)

        work_date = get_revenue_report_date(request)
        start, end = get_operational_window(work_date)

        payment_filters = {
            'collection__invoice__branch': branch,
            'collection__created_at__gte': start,
            'collection__created_at__lt': end,
        }

        payment_totals = PaymentEntry.objects.filter(
            **payment_filters
        ).aggregate(
            cash=Sum('amount', filter=Q(method='CASH')),
            mpesa=Sum('amount', filter=Q(method='MPESA')),
            gross=Sum('amount'),
        )

        reversal_filters = {
            'payment_entry__collection__invoice__branch': branch,
            'created_at__gte': start,
            'created_at__lt': end,
        }

        reversal_totals = PaymentReversal.objects.filter(
            **reversal_filters
        ).aggregate(
            cash=Sum(
                'amount',
                filter=Q(payment_entry__method='CASH'),
            ),
            mpesa=Sum(
                'amount',
                filter=Q(payment_entry__method='MPESA'),
            ),
            total=Sum('amount'),
        )

        cash_collected = payment_totals['cash'] or Decimal('0.00')
        mpesa_collected = payment_totals['mpesa'] or Decimal('0.00')
        gross_collections = payment_totals['gross'] or Decimal('0.00')

        cash_reversed = reversal_totals['cash'] or Decimal('0.00')
        mpesa_reversed = reversal_totals['mpesa'] or Decimal('0.00')
        total_reversals = reversal_totals['total'] or Decimal('0.00')

        net_cash = cash_collected - cash_reversed
        net_mpesa = mpesa_collected - mpesa_reversed
        net_collections = gross_collections - total_reversals

        daily_target = branch.daily_revenue_target or Decimal('0.00')

        achievement = (
            (net_collections / daily_target) * Decimal('100')
            if daily_target > 0
            else None
        )

        return Response({
            'branch_id': branch.id,
            'branch_name': branch.name,
            'branch_code': branch.code,
            'work_date': work_date.isoformat(),
            'operational_start': start.isoformat(),
            'operational_end': end.isoformat(),
            'cash_collected': money_string(cash_collected),
            'mpesa_collected': money_string(mpesa_collected),
            'gross_collections': money_string(gross_collections),
            'cash_reversed': money_string(cash_reversed),
            'mpesa_reversed': money_string(mpesa_reversed),
            'total_reversals': money_string(total_reversals),
            'net_cash': money_string(net_cash),
            'net_mpesa': money_string(net_mpesa),
            'net_collections': money_string(net_collections),
            'daily_target': money_string(daily_target),
            'target_achievement_percentage': (
                round(float(achievement), 2)
                if achievement is not None
                else None
            ),
        })

class CleanerCommissionListView(APIView):
    """GET /api/payments/commissions/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_commission_read_access(request.user)
        queryset = get_accessible_commission_queryset(request.user)

        branch_id = request.query_params.get('branch')
        staff_id = request.query_params.get('staff')
        visit_id = request.query_params.get('visit')

        if branch_id:
            if (
                request.user.role == User.Role.SUPERVISOR
                and not request.user.is_superuser
                and str(get_supervisor_branch(request.user).pk) != str(branch_id)
            ):
                raise PermissionDenied(
                    'You can only view commissions for your branch.'
                )
            queryset = queryset.filter(branch_id=branch_id)

        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)

        if visit_id:
            queryset = queryset.filter(visit_id=visit_id)

        queryset = apply_date_filters(
            queryset,
            request,
            'generated_at',
        )

        serializer = CleanerCommissionReadSerializer(
            queryset.order_by('-generated_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

class CleanerCommissionDetailView(APIView):
    """GET /api/payments/commissions/<commission_id>/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, commission_id):
        ensure_commission_read_access(request.user)

        commission = get_object_or_404(
            get_accessible_commission_queryset(request.user),
            pk=commission_id,
        )

        serializer = CleanerCommissionReadSerializer(
            commission,
            context={'request': request},
        )
        return Response(serializer.data)

class CleanerCommissionSummaryView(APIView):
    """GET /api/payments/commissions/summary/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_commission_read_access(request.user)

        commissions = get_accessible_commission_queryset(request.user)
        commissions = apply_date_filters(
            commissions,
            request,
            'generated_at',
        )

        earned_rows = commissions.values(
            'staff_id',
            'branch_id',
        ).annotate(
            earned=Sum('earned_amount'),
        )

        adjustments = get_accessible_adjustment_queryset(
            request.user
        )
        adjustments = apply_date_filters(
            adjustments,
            request,
            'created_at',
        )

        adjustment_rows = adjustments.values(
            'commission__staff_id',
            'commission__branch_id',
        ).annotate(total=Sum('amount'))

        payouts = get_accessible_payout_queryset(request.user)
        payouts = apply_date_filters(payouts, request, 'paid_at')

        payout_rows = payouts.values(
            'staff_id',
            'branch_id',
        ).annotate(total=Sum('amount'))

        totals = {}

        for row in earned_rows:
            key = (row['staff_id'], row['branch_id'])
            totals[key] = {
                'earned': row['earned'] or Decimal('0.00'),
                'adjustments': Decimal('0.00'),
                'paid': Decimal('0.00'),
            }

        for row in adjustment_rows:
            key = (
                row['commission__staff_id'],
                row['commission__branch_id'],
            )
            totals.setdefault(key, {
                'earned': Decimal('0.00'),
                'adjustments': Decimal('0.00'),
                'paid': Decimal('0.00'),
            })
            totals[key]['adjustments'] = row['total'] or Decimal('0.00')

        for row in payout_rows:
            key = (row['staff_id'], row['branch_id'])
            totals.setdefault(key, {
                'earned': Decimal('0.00'),
                'adjustments': Decimal('0.00'),
                'paid': Decimal('0.00'),
            })
            totals[key]['paid'] = row['total'] or Decimal('0.00')

        staff_ids = {key[0] for key in totals}
        branch_ids = {key[1] for key in totals}

        staff_map = StaffProfile.objects.in_bulk(staff_ids)
        branch_map = Branch.objects.in_bulk(branch_ids)

        results = []

        for (staff_id, branch_id), amounts in sorted(
            totals.items(),
            key=lambda item: (item[0][1], item[0][0]),
        ):
            staff = staff_map.get(staff_id)
            branch = branch_map.get(branch_id)

            if not staff or not branch:
                continue

            earned = amounts['earned']
            adjustment_total = amounts['adjustments']
            paid = amounts['paid']
            net_earned = earned + adjustment_total
            balance = net_earned - paid

            results.append({
                'staff_id': staff.id,
                'staff_number': staff.staff_number,
                'branch_id': branch.id,
                'branch_name': branch.name,
                'earned_commission': money_string(earned),
                'adjustments': money_string(adjustment_total),
                'net_earned': money_string(net_earned),
                'paid': money_string(paid),
                'outstanding_balance': money_string(balance),
            })

        return Response(results)

class CommissionPayoutListCreateView(APIView):
    """
    GET  /api/payments/commission-payouts/
    POST /api/payments/commission-payouts/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_commission_read_access(request.user)
        queryset = get_accessible_payout_queryset(request.user)

        staff_id = request.query_params.get('staff')
        branch_id = request.query_params.get('branch')

        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)

        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)

        queryset = apply_date_filters(queryset, request, 'paid_at')

        serializer = CommissionPayoutReadSerializer(
            queryset.order_by('-paid_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

    def post(self, request):
        ensure_payout_write_access(request.user)

        input_serializer = CommissionPayoutCreateSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        idempotency_key = data.get('idempotency_key')

        try:
            with transaction.atomic():
                if idempotency_key:
                    existing = CommissionPayout.objects.filter(
                        idempotency_key=idempotency_key,
                    ).first()

                    if existing:
                        same_request = (
                            existing.staff_id == data['staff']
                            and existing.branch_id == data['branch']
                            and existing.amount == data['amount']
                            and existing.method == data['method']
                            and existing.reference == data['reference']
                        )

                        if not same_request:
                            raise ValidationError({
                                'idempotency_key': (
                                    'This key has already been used '
                                    'for a different payout.'
                                )
                            })

                        output = CommissionPayoutReadSerializer(existing)
                        return Response(output.data)

                staff = get_object_or_404(
                    StaffProfile.objects.select_for_update().select_related(
                        'branch',
                        'user',
                    ),
                    pk=data['staff'],
                )

                if staff.user.role != User.Role.CLEANER:
                    raise ValidationError({
                        'staff': 'Commission payouts are only for cleaners.'
                    })

                if staff.branch_id != data['branch']:
                    raise ValidationError({
                        'branch': (
                            'The payout branch must match the employee '
                            'current branch.'
                        )
                    })

                balance = get_staff_branch_balance(
                    staff.id,
                    data['branch'],
                )

                if balance <= Decimal('0.00'):
                    raise ValidationError({
                        'amount': 'This employee has no outstanding '
                                  'commission balance.'
                    })

                if data['amount'] > balance:
                    raise ValidationError({
                        'amount': (
                            f'The maximum available payout is KES '
                            f'{balance:.2f}.'
                        )
                    })

                payout = CommissionPayout(
                    staff=staff,
                    branch_id=data['branch'],
                    amount=data['amount'],
                    method=data['method'],
                    reference=data['reference'],
                    recorded_by=request.user,
                )

                if idempotency_key:
                    payout.idempotency_key = idempotency_key

                payout.full_clean()
                payout.save()

        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)
        except IntegrityError:
            raise ValidationError({
                'reference': (
                    'This M-PESA reference or idempotency key '
                    'has already been used.'
                )
            })

        output = CommissionPayoutReadSerializer(payout)
        return Response(output.data, status=status.HTTP_201_CREATED)

class CommissionAdjustmentListCreateView(APIView):
    """
    GET  /api/payments/commission-adjustments/
    POST /api/payments/commission-adjustments/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_commission_read_access(request.user)
        queryset = get_accessible_adjustment_queryset(request.user)

        commission_id = request.query_params.get('commission')
        staff_id = request.query_params.get('staff')
        branch_id = request.query_params.get('branch')

        if commission_id:
            queryset = queryset.filter(commission_id=commission_id)

        if staff_id:
            queryset = queryset.filter(
                commission__staff_id=staff_id
            )

        if branch_id:
            queryset = queryset.filter(
                commission__branch_id=branch_id
            )

        queryset = apply_date_filters(
            queryset,
            request,
            'created_at',
        )

        serializer = CommissionAdjustmentReadSerializer(
            queryset.order_by('-created_at', '-id'),
            many=True,
            context={'request': request},
        )
        return Response(serializer.data)

    def post(self, request):
        ensure_adjustment_write_access(request.user)

        input_serializer = CommissionAdjustmentCreateSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        idempotency_key = data.get('idempotency_key')

        try:
            with transaction.atomic():
                if idempotency_key:
                    existing = CommissionAdjustment.objects.filter(
                        idempotency_key=idempotency_key,
                    ).first()

                    if existing:
                        same_request = (
                            existing.commission_id == data['commission']
                            and existing.amount == data['amount']
                            and existing.reason == data['reason']
                        )

                        if not same_request:
                            raise ValidationError({
                                'idempotency_key': (
                                    'This key has already been used '
                                    'for a different adjustment.'
                                )
                            })

                        output = CommissionAdjustmentReadSerializer(existing)
                        return Response(output.data)

                commission_reference = get_object_or_404(
                    CleanerCommission.objects.only(
                        'id',
                        'staff_id',
                    ),
                    pk=data['commission'],
                )

                StaffProfile.objects.select_for_update().get(
                    pk=commission_reference.staff_id,
                )

                commission = get_object_or_404(
                    CleanerCommission.objects.select_for_update().select_related(
                        'staff',
                        'branch',
                    ),
                    pk=data['commission'],
                )

                current_balance = get_staff_branch_balance(
                    commission.staff_id,
                    commission.branch_id,
                )

                new_balance = current_balance + data['amount']

                if new_balance < Decimal('0.00'):
                    raise ValidationError({
                        'amount': (
                            'This negative adjustment would make the '
                            'employee outstanding commission balance '
                            'negative. The adjustment was not recorded.'
                        )
                    })

                adjustment = CommissionAdjustment(
                    commission=commission,
                    amount=data['amount'],
                    reason=data['reason'],
                    adjusted_by=request.user,
                )

                if idempotency_key:
                    adjustment.idempotency_key = idempotency_key

                adjustment.full_clean()
                adjustment.save()

        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)
        except IntegrityError:
            raise ValidationError({
                'idempotency_key': (
                    'This idempotency key has already been used.'
                )
            })

        output = CommissionAdjustmentReadSerializer(adjustment)
        return Response(output.data, status=status.HTTP_201_CREATED)

class BranchTaxConfigurationListCreateView(APIView):
    """
    GET  /api/payments/tax-configurations/
    POST /api/payments/tax-configurations/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_tax_configuration_access(request.user)

        branches = Branch.objects.order_by('name')

        branch_id = request.query_params.get('branch')

        configurations = (
            BranchTaxConfiguration.objects
            .select_related('branch', 'created_by')
            .order_by('branch__name', '-effective_from')
        )

        if branch_id:
            if not branch_id.isdigit():
                raise ValidationError({
                    'branch': 'Provide a valid branch ID.'
                })

            configurations = configurations.filter(
                branch_id=branch_id
            )

        branch_data = [
            {
                'id': branch.id,
                'name': branch.name,
                'code': branch.code,
                'is_active': branch.is_active,
            }
            for branch in branches
        ]

        serializer = BranchTaxConfigurationReadSerializer(
            configurations,
            many=True,
        )

        return Response({
            'branches': branch_data,
            'configurations': serializer.data,
            'today': timezone.localdate().isoformat(),
        })

    def post(self, request):
        ensure_tax_configuration_access(request.user)

        input_serializer = BranchTaxConfigurationCreateSerializer(
            data=request.data,
        )
        input_serializer.is_valid(raise_exception=True)

        data = input_serializer.validated_data
        effective_from = data['effective_from']
        today = timezone.localdate()

        if effective_from < today:
            raise ValidationError({
                'effective_from': (
                    'VAT configuration cannot be backdated. '
                    'Choose today or a future date.'
                )
            })

        try:
            with transaction.atomic():
                branch = get_object_or_404(
                    Branch.objects.select_for_update(),
                    pk=data['branch'],
                )

                existing_configs = list(
                    BranchTaxConfiguration.objects
                    .select_for_update()
                    .filter(branch=branch)
                    .order_by('effective_from')
                )

                previous_open_config = None

                for existing in existing_configs:
                    if existing.effective_from >= effective_from:
                        raise ValidationError({
                            'effective_from': (
                                'A VAT configuration already exists '
                                'with this date or a later date. '
                                'Choose a later effective date.'
                            )
                        })

                    if existing.effective_until is None:
                        previous_open_config = existing

                    elif existing.effective_until >= effective_from:
                        raise ValidationError({
                            'effective_from': (
                                'The selected date overlaps an existing '
                                'VAT configuration period.'
                            )
                        })

                if previous_open_config:
                    previous_open_config.effective_until = (
                        effective_from - timedelta(days=1)
                    )
                    previous_open_config.save()

                configuration = BranchTaxConfiguration(
                    branch=branch,
                    is_vat_registered=data['is_vat_registered'],
                    vat_rate=data.get('vat_rate'),
                    tax_registration_number=data[
                        'tax_registration_number'
                    ],
                    legal_business_name=data['legal_business_name'],
                    effective_from=effective_from,
                    effective_until=None,
                    created_by=request.user,
                )

                configuration.full_clean()
                configuration.save()

        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)

        except IntegrityError:
            raise ValidationError({
                'effective_from': (
                    'A conflicting VAT configuration already exists. '
                    'Refresh the page and try again.'
                )
            })

        output = BranchTaxConfigurationReadSerializer(
            configuration,
        )

        return Response(
            output.data,
            status=status.HTTP_201_CREATED,
        )