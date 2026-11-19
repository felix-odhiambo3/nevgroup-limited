from datetime import datetime, time, timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch, Q, Sum
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
)
from payments.serializers import (
    InvoiceReadSerializer,
    PaymentCollectionCreateSerializer,
    PaymentCollectionReadSerializer,
    PaymentReversalCreateSerializer,
    PaymentReversalReadSerializer,
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


def get_supervisor_branch(user):
    """
    Return the active supervisor's branch.

    Supervisors can only access payment records belonging to
    their own active branch.
    """
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


def ensure_payment_view_access(user):
    """Allow approved payment-viewing roles."""
    if user.is_superuser:
        return

    if user.role not in PAYMENT_VIEW_ROLES:
        raise PermissionDenied(
            'You do not have permission to access payment records.'
        )


def ensure_reversal_access(user):
    """Only OWNER, ADMIN and ACCOUNTS can reverse payments."""
    if user.is_superuser:
        return

    if user.role not in REVERSAL_ROLES:
        raise PermissionDenied(
            'Only OWNER, ADMIN or ACCOUNTS can reverse payments.'
        )


def get_accessible_invoice_queryset(user):
    """Return invoices the authenticated user is allowed to access."""
    queryset = Invoice.objects.select_related(
        'branch',
        'customer',
        'visit',
        'created_by',
        'issued_by',
    ).prefetch_related(
        'lines',
    )

    if user.is_superuser or user.role in GLOBAL_PAYMENT_ROLES:
        return queryset

    if user.role == User.Role.SUPERVISOR:
        branch = get_supervisor_branch(user)
        return queryset.filter(branch=branch)

    raise PermissionDenied(
        'You do not have permission to access these invoices.'
    )


def get_accessible_collection_queryset(user):
    """Return payment collections the authenticated user can view."""
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
        branch = get_supervisor_branch(user)
        return queryset.filter(invoice__branch=branch)

    raise PermissionDenied(
        'You do not have permission to access payment collections.'
    )


def convert_workflow_validation_error(exc):
    """Convert Django validation errors into DRF validation errors."""
    if hasattr(exc, 'message_dict'):
        detail = exc.message_dict
    elif hasattr(exc, 'messages'):
        detail = exc.messages
    else:
        detail = str(exc)

    raise ValidationError(detail)


def get_operational_window(work_date):
    """
    Operational day: 7:00 AM on work_date to 7:00 AM
    on the following calendar day, in the active Django timezone.
    """
    current_tz = timezone.get_current_timezone()

    start = timezone.make_aware(
        datetime.combine(work_date, time(7, 0)),
        current_tz,
    )

    end = start + timedelta(days=1)

    return start, end


def get_default_operational_date():
    """Use the 7:00 AM operational-day cutoff."""
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


def money_string(value):
    """Return a two-decimal monetary value as a JSON-safe string."""
    return f'{value or 0:.2f}'


class InvoiceListView(APIView):
    """
    GET /api/payments/invoices/

    List invoices accessible to the authenticated user.
    """
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

        queryset = queryset.order_by('-created_at', '-id')

        serializer = InvoiceReadSerializer(
            queryset,
            many=True,
            context={'request': request},
        )

        return Response(serializer.data)


class InvoiceDetailView(APIView):
    """
    GET /api/payments/invoices/<invoice_id>/

    Retrieve one accessible invoice.
    """
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
    """
    GET /api/payments/collections/

    List payment collections and receipts accessible to the user.
    """
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

        queryset = queryset.order_by('-created_at', '-id')

        serializer = PaymentCollectionReadSerializer(
            queryset,
            many=True,
            context={'request': request},
        )

        return Response(serializer.data)


class PaymentCollectionDetailView(APIView):
    """
    GET /api/payments/collections/<collection_id>/

    Retrieve one receipt with its payment entries and invoice details.
    """
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
    """
    POST /api/payments/invoices/<invoice_id>/collections/

    Record cash, M-PESA or split payment against an invoice.
    """
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

        validated_data = input_serializer.validated_data

        try:
            collection = record_payment_collection(
                invoice_id=invoice.pk,
                user=request.user,
                payments=validated_data['payments'],
                idempotency_key=validated_data.get('idempotency_key'),
            )
        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)

        output_serializer = PaymentCollectionReadSerializer(
            collection,
            context={'request': request},
        )

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class PaymentReversalListView(APIView):
    """
    GET /api/payments/reversals/

    View the financial reversal audit history.

    Restricted to OWNER, ADMIN and ACCOUNTS.
    """
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

        queryset = queryset.order_by('-created_at', '-id')

        serializer = PaymentReversalReadSerializer(
            queryset,
            many=True,
            context={'request': request},
        )

        return Response(serializer.data)


class PaymentReversalCreateView(APIView):
    """
    POST /api/payments/entries/<payment_entry_id>/reversals/

    Reverse all or part of a payment entry.

    Restricted to OWNER, ADMIN and ACCOUNTS.
    """
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

        validated_data = input_serializer.validated_data

        try:
            reversal = reverse_payment(
                payment_entry_id=payment_entry.pk,
                amount=validated_data['amount'],
                reason=validated_data['reason'],
                user=request.user,
                idempotency_key=validated_data.get('idempotency_key'),
            )
        except DjangoValidationError as exc:
            convert_workflow_validation_error(exc)

        output_serializer = PaymentReversalReadSerializer(
            reversal,
            context={'request': request},
        )

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class SupervisorRevenueSummaryView(APIView):
    """
    GET /api/payments/revenue-summary/

    Daily revenue summary for the authenticated supervisor's own branch.

    Gross collections are based on PaymentEntry records received during
    the operational day.

    Reversals are based on PaymentReversal records processed during
    the operational day, including reversals of older collections.

    Net collections = gross collections - reversals.
    """
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
            cash=Sum(
                'amount',
                filter=Q(method='CASH'),
            ),
            mpesa=Sum(
                'amount',
                filter=Q(method='MPESA'),
            ),
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

        cash_collected = payment_totals['cash'] or 0
        mpesa_collected = payment_totals['mpesa'] or 0
        gross_collections = payment_totals['gross'] or 0

        cash_reversed = reversal_totals['cash'] or 0
        mpesa_reversed = reversal_totals['mpesa'] or 0
        total_reversals = reversal_totals['total'] or 0

        net_cash = cash_collected - cash_reversed
        net_mpesa = mpesa_collected - mpesa_reversed
        net_collections = gross_collections - total_reversals

        daily_target = branch.daily_revenue_target or 0

        achievement = (
            float((net_collections / daily_target) * 100)
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
                round(achievement, 2)
                if achievement is not None
                else None
            ),
        })