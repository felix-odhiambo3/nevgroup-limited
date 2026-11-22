
from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from payments.models import (
    Invoice,
    InvoiceLine,
    PaymentCollection,
    PaymentEntry,
    PaymentReversal,
    CleanerCommission,
    CommissionPayout,
    CommissionAdjustment,
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
        attrs['reference'] = attrs.get('reference', '').strip()

        if (
            attrs['method'] == PaymentEntry.Method.MPESA
            and not attrs['reference']
        ):
            raise serializers.ValidationError({
                'reference': 'An M-PESA transaction reference is required.'
            })

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

        if total <= ZERO:
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
        return obj.reversals.aggregate(
            total=Sum('amount'),
        )['total'] or ZERO

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
    visit_id = serializers.IntegerField(read_only=True)
    lines = InvoiceLineReadSerializer(many=True, read_only=True)
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
            'is_provisional',
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

class CleanerCommissionReadSerializer(serializers.ModelSerializer):
    """Read-only individual cleaner commission record."""

    branch_name = serializers.CharField(
        source='branch.name',
        read_only=True,
    )
    invoice_number = serializers.CharField(
        source='invoice_line.invoice.invoice_number',
        read_only=True,
    )
    visit_id = serializers.IntegerField(read_only=True)
    adjustments_total = serializers.SerializerMethodField()
    net_earned_amount = serializers.SerializerMethodField()

    class Meta:
        model = CleanerCommission
        fields = [
            'id',
            'assignment',
            'invoice_line',
            'invoice_number',
            'visit',
            'visit_id',
            'visit_service',
            'staff',
            'staff_number',
            'service_name',
            'branch',
            'branch_name',
            'shift',
            'rate_percent',
            'commission_base_amount',
            'allocated_commission_base_amount',
            'service_commission_amount',
            'earned_amount',
            'adjustments_total',
            'net_earned_amount',
            'generated_at',
        ]
        read_only_fields = fields

    def get_adjustments_total(self, obj):
        total = sum(
            (adjustment.amount for adjustment in obj.adjustments.all()),
            ZERO,
        )
        return total

    def get_net_earned_amount(self, obj):
        return obj.earned_amount + self.get_adjustments_total(obj)

class CommissionPayoutReadSerializer(serializers.ModelSerializer):
    """Read-only commission payout record."""

    staff_number = serializers.CharField(
        source='staff.staff_number',
        read_only=True,
    )
    branch_name = serializers.CharField(
        source='branch.name',
        read_only=True,
    )
    method_display = serializers.CharField(
        source='get_method_display',
        read_only=True,
    )
    recorded_by_name = serializers.CharField(
        source='recorded_by.get_full_name',
        read_only=True,
    )

    class Meta:
        model = CommissionPayout
        fields = [
            'id',
            'staff',
            'staff_number',
            'branch',
            'branch_name',
            'amount',
            'method',
            'method_display',
            'reference',
            'recorded_by',
            'recorded_by_name',
            'idempotency_key',
            'paid_at',
        ]
        read_only_fields = fields

class CommissionPayoutCreateSerializer(serializers.Serializer):
    """Input for recording a cleaner commission payout."""

    staff = serializers.IntegerField(min_value=1)
    branch = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01'),
    )
    method = serializers.ChoiceField(
        choices=CommissionPayout.Method.choices,
    )
    reference = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='',
    )
    idempotency_key = serializers.UUIDField(
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        attrs['reference'] = attrs.get('reference', '').strip()

        if (
            attrs['method'] == CommissionPayout.Method.MPESA
            and not attrs['reference']
        ):
            raise serializers.ValidationError({
                'reference': 'An M-PESA transaction reference is required.'
            })

        return attrs

class CommissionAdjustmentReadSerializer(serializers.ModelSerializer):
    """Read-only audited commission adjustment."""

    staff_number = serializers.CharField(
        source='commission.staff_number',
        read_only=True,
    )
    service_name = serializers.CharField(
        source='commission.service_name',
        read_only=True,
    )
    branch_name = serializers.CharField(
        source='commission.branch.name',
        read_only=True,
    )
    adjusted_by_name = serializers.CharField(
        source='adjusted_by.get_full_name',
        read_only=True,
    )

    class Meta:
        model = CommissionAdjustment
        fields = [
            'id',
            'commission',
            'staff_number',
            'service_name',
            'branch_name',
            'amount',
            'reason',
            'adjusted_by',
            'adjusted_by_name',
            'idempotency_key',
            'created_at',
        ]
        read_only_fields = fields

class CommissionAdjustmentCreateSerializer(serializers.Serializer):
    """Input for an audited commission correction."""

    commission = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
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

    def validate_amount(self, value):
        if value == ZERO:
            raise serializers.ValidationError(
                'An adjustment cannot be zero.'
            )
        return value