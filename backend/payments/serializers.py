
from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from payments.models import (
    Invoice,
    InvoiceLine,
    PaymentCollection,
    PaymentEntry,
    PaymentReversal,
)
from payments.workflows import get_invoice_payment_summary
from payments.services import ZERO


class PaymentEntryInputSerializer(serializers.Serializer):
    """Validate one cash or M-PESA tender line."""

    method = serializers.ChoiceField(
        choices=PaymentEntry.Method.choices,
    )

    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01'),
    )

    reference = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='',
    )

    def validate(self, attrs):
        if (
            attrs['method'] == PaymentEntry.Method.MPESA
            and not attrs.get('reference', '').strip()
        ):
            raise serializers.ValidationError({
                'reference': 'An M-PESA transaction reference is required.'
            })

        attrs['reference'] = attrs.get('reference', '').strip()
        return attrs


class PaymentCollectionCreateSerializer(serializers.Serializer):
    """Input for creating one collection and its receipt."""

    payments = PaymentEntryInputSerializer(
        many=True,
        allow_empty=False,
    )

    idempotency_key = serializers.UUIDField(
        required=False,
        allow_null=True,
    )

    def validate_payments(self, payments):
        total = sum(
            (payment['amount'] for payment in payments),
            start=Decimal('0.00'),
        )

        if total <= Decimal('0.00'):
            raise serializers.ValidationError(
                'The total payment must be greater than zero.'
            )

        return payments


class PaymentReversalCreateSerializer(serializers.Serializer):
    """Input for reversing all or part of a payment entry."""

    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01'),
    )

    reason = serializers.CharField(
        max_length=255,
        allow_blank=False,
        trim_whitespace=True,
    )

    idempotency_key = serializers.UUIDField(
        required=False,
        allow_null=True,
    )


class InvoiceLineReadSerializer(serializers.ModelSerializer):
    """Read-only historical invoice line."""

    class Meta:
        model = InvoiceLine
        fields = [
            'id',
            'visit_service',
            'service_name',
            'service_code',
            'service_category',
            'quantity',
            'unit_price',
            'bargaining_discount',
            'loyalty_discount',
            'taxable_amount',
            'vat_rate',
            'vat_amount',
            'line_total',
            'commission_base_amount',
            'zero_price_reason',
            'created_at',
        ]
        read_only_fields = fields


class PaymentEntryReadSerializer(serializers.ModelSerializer):
    """Read-only payment tender details."""

    method_display = serializers.CharField(
        source='get_method_display',
        read_only=True,
    )

    reversed_amount = serializers.SerializerMethodField()
    remaining_reversible_amount = serializers.SerializerMethodField()

    class Meta:
        model = PaymentEntry
        fields = [
            'id',
            'method',
            'method_display',
            'amount',
            'reference',
            'reversed_amount',
            'remaining_reversible_amount',
            'created_at',
        ]
        read_only_fields = fields

    def get_reversed_amount(self, obj):
        total = obj.reversals.aggregate(
            total=Sum('amount'),
        )['total'] or ZERO

        return total

    def get_remaining_reversible_amount(self, obj):
        reversed_total = obj.reversals.aggregate(
            total=Sum('amount'),
        )['total'] or ZERO

        return max(obj.amount - reversed_total, ZERO)


class PaymentReversalReadSerializer(serializers.ModelSerializer):
    """Read-only financial reversal audit record."""

    reversed_by_name = serializers.CharField(
        source='reversed_by.get_full_name',
        read_only=True,
    )

    method = serializers.CharField(
        source='payment_entry.method',
        read_only=True,
    )

    payment_reference = serializers.CharField(
        source='payment_entry.reference',
        read_only=True,
    )

    receipt_number = serializers.CharField(
        source='payment_entry.collection.receipt_number',
        read_only=True,
    )

    class Meta:
        model = PaymentReversal
        fields = [
            'id',
            'payment_entry',
            'receipt_number',
            'method',
            'payment_reference',
            'amount',
            'reason',
            'reversed_by',
            'reversed_by_name',
            'idempotency_key',
            'created_at',
        ]
        read_only_fields = fields


class PaymentCollectionReadSerializer(serializers.ModelSerializer):
    """Read-only collection and combined receipt."""

    invoice_number = serializers.CharField(
        source='invoice.invoice_number',
        read_only=True,
    )

    customer_name = serializers.CharField(
        source='invoice.customer_name',
        read_only=True,
    )

    customer_phone = serializers.CharField(
        source='invoice.customer_phone',
        read_only=True,
    )

    branch_name = serializers.CharField(
        source='invoice.branch_name',
        read_only=True,
    )

    branch_address = serializers.CharField(
        source='invoice.branch_address',
        read_only=True,
    )

    branch_phone = serializers.CharField(
        source='invoice.branch_phone',
        read_only=True,
    )

    branch_tax_registration_number = serializers.CharField(
        source='invoice.branch_tax_registration_number',
        read_only=True,
    )

    invoice_total = serializers.DecimalField(
        source='invoice.total_amount',
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    vat_amount = serializers.DecimalField(
        source='invoice.vat_amount',
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    is_vat_registered = serializers.BooleanField(
        source='invoice.is_vat_registered',
        read_only=True,
    )

    vat_rate = serializers.DecimalField(
        source='invoice.vat_rate',
        max_digits=5,
        decimal_places=2,
        allow_null=True,
        read_only=True,
    )

    received_by_name = serializers.CharField(
        source='received_by.get_full_name',
        read_only=True,
    )

    entries = PaymentEntryReadSerializer(
        many=True,
        read_only=True,
    )

    invoice_lines = InvoiceLineReadSerializer(
        source='invoice.lines',
        many=True,
        read_only=True,
    )

    total_received = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    payment_summary = serializers.SerializerMethodField()

    class Meta:
        model = PaymentCollection
        fields = [
            'id',
            'receipt_number',
            'invoice',
            'invoice_number',
            'customer_name',
            'customer_phone',
            'branch_name',
            'branch_address',
            'branch_phone',
            'branch_tax_registration_number',
            'invoice_total',
            'is_vat_registered',
            'vat_rate',
            'vat_amount',
            'entries',
            'invoice_lines',
            'total_received',
            'payment_summary',
            'received_by',
            'received_by_name',
            'created_at',
        ]
        read_only_fields = fields

    def get_payment_summary(self, obj):
        return get_invoice_payment_summary(obj.invoice)


class InvoiceReadSerializer(serializers.ModelSerializer):
    """Read-only invoice with its lines and current payment position."""

    branch_name = serializers.CharField(
        source='branch.name',
        read_only=True,
    )

    visit_id = serializers.IntegerField(
        read_only=True,
    )

    lines = InvoiceLineReadSerializer(
        many=True,
        read_only=True,
    )

    payment_summary = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id',
            'visit_id',
            'branch',
            'branch_name',
            'customer',
            'invoice_number',
            'status',
            'customer_name',
            'customer_phone',
            'branch_address',
            'branch_phone',
            'branch_tax_registration_number',
            'is_vat_registered',
            'vat_rate',
            'subtotal',
            'bargaining_discount_total',
            'loyalty_discount_total',
            'discount_amount',
            'discount_reason',
            'taxable_amount',
            'vat_amount',
            'total_amount',
            'commission_base_amount',
            'lines',
            'payment_summary',
            'created_by',
            'issued_by',
            'created_at',
            'issued_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_payment_summary(self, obj):
        return get_invoice_payment_summary(obj)
