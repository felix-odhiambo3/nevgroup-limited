
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
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
    """
    Return invoices the authenticated user is allowed to access.
    """

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
    """
    Return payment collections the authenticated user can view.
    """

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
    """
    Convert Django validation errors into DRF validation errors.
    """

    if hasattr(exc, 'message_dict'):
        detail = exc.message_dict
    elif hasattr(exc, 'messages'):
        detail = exc.messages
    else:
        detail = str(exc)

    raise ValidationError(detail)


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
