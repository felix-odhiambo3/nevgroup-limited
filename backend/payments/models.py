
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Q, Sum

from branches.models import Branch
from vehicles.models import Customer
from visits.models import Visit, VisitService


ZERO = Decimal('0.00')


class BranchTaxConfiguration(models.Model):
    """
    Effective-dated VAT configuration for an individual branch.

    Date periods are inclusive. Invoices retain VAT snapshots
    so future configuration changes do not affect old invoices.
    """

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='tax_configurations',
    )

    is_vat_registered = models.BooleanField(default=False)

    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(ZERO),
            MaxValueValidator(Decimal('100.00')),
        ],
        help_text='VAT percentage, for example 16.00.',
    )

    tax_registration_number = models.CharField(
        max_length=50,
        blank=True,
    )

    legal_business_name = models.CharField(
        max_length=200,
        blank=True,
    )

    effective_from = models.DateField()
    effective_until = models.DateField(
        null=True,
        blank=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_branch_tax_configurations',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch', '-effective_from']
        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'effective_from'],
                name='unique_branch_tax_effective_date',
            ),
            models.CheckConstraint(
                condition=(
                    Q(vat_rate__isnull=True)
                    | Q(
                        vat_rate__gte=ZERO,
                        vat_rate__lte=Decimal('100.00'),
                    )
                ),
                name='branch_vat_rate_valid_range',
            ),
            models.CheckConstraint(
                condition=(
                    Q(effective_until__isnull=True)
                    | Q(effective_until__gte=models.F('effective_from'))
                ),
                name='branch_tax_valid_date_range',
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}

        if self.is_vat_registered and self.vat_rate is None:
            errors['vat_rate'] = (
                'A VAT rate is required for a VAT-registered branch.'
            )

        if not self.is_vat_registered and self.vat_rate is not None:
            errors['vat_rate'] = (
                'A VAT rate cannot be configured for a '
                'non-VAT-registered branch.'
            )

        if (
            self.effective_from
            and self.effective_until
            and self.effective_until < self.effective_from
        ):
            errors['effective_until'] = (
                'The end date cannot be before the start date.'
            )

        if self.branch_id and self.effective_from:
            overlapping = BranchTaxConfiguration.objects.filter(
                branch_id=self.branch_id,
            ).exclude(pk=self.pk)

            if self.effective_until is not None:
                overlapping = overlapping.filter(
                    effective_from__lte=self.effective_until,
                )

            overlapping = overlapping.filter(
                Q(effective_until__isnull=True)
                | Q(effective_until__gte=self.effective_from)
            )

            if overlapping.exists():
                errors['effective_from'] = (
                    'This tax configuration overlaps another '
                    'configuration for the same branch.'
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return (
            f'{self.branch.name} tax configuration '
            f'from {self.effective_from}'
        )


class Invoice(models.Model):

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ISSUED = 'ISSUED', 'Issued'
        PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially Paid'
        PAID = 'PAID', 'Paid'
        CREDIT = 'CREDIT', 'Credit Outstanding'
        VOID = 'VOID', 'Voided'

    visit = models.OneToOneField(
        Visit,
        on_delete=models.PROTECT,
        related_name='invoice',
    )

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='invoices',
    )

    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='invoices',
        null=True,
        blank=True,
    )

    invoice_number = models.CharField(
        max_length=40,
        unique=True,
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    customer_name = models.CharField(max_length=150, blank=True)
    customer_phone = models.CharField(max_length=20, blank=True)

    branch_name = models.CharField(max_length=150)
    branch_address = models.CharField(max_length=255, blank=True)
    branch_phone = models.CharField(max_length=20, blank=True)
    branch_tax_registration_number = models.CharField(
        max_length=50,
        blank=True,
    )

    is_vat_registered = models.BooleanField(default=False)

    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(ZERO),
            MaxValueValidator(Decimal('100.00')),
        ],
    )

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    bargaining_discount_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    loyalty_discount_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    discount_reason = models.CharField(max_length=255, blank=True)

    taxable_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    vat_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    commission_base_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_invoices',
    )

    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='issued_invoices',
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=Q(subtotal__gte=ZERO),
                name='invoice_subtotal_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(bargaining_discount_total__gte=ZERO),
                name='invoice_bargain_discount_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(loyalty_discount_total__gte=ZERO),
                name='invoice_loyalty_discount_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(discount_amount__gte=ZERO),
                name='invoice_discount_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(taxable_amount__gte=ZERO),
                name='invoice_taxable_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(vat_amount__gte=ZERO),
                name='invoice_vat_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(total_amount__gte=ZERO),
                name='invoice_total_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(commission_base_amount__gte=ZERO),
                name='invoice_commission_base_nonnegative',
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}

        if self.visit_id and self.branch_id:
            if self.visit.branch_id != self.branch_id:
                errors['branch'] = (
                    'The invoice branch must match the visit branch.'
                )

        if self.is_vat_registered and self.vat_rate is None:
            errors['vat_rate'] = (
                'A VAT rate is required for a VAT-registered invoice.'
            )

        if not self.is_vat_registered:
            if self.vat_rate is not None:
                errors['vat_rate'] = (
                    'A non-VAT-registered invoice cannot have a VAT rate.'
                )

            if self.vat_amount != ZERO:
                errors['vat_amount'] = (
                    'VAT cannot be charged on a non-VAT-registered invoice.'
                )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.invoice_number or f'Invoice draft #{self.pk}'


class InvoiceLine(models.Model):
    """
    Historical snapshot of a service charged on an invoice.

    Bargaining discounts reduce the commission basis.
    Loyalty discounts reduce the customer charge but do not
    reduce the commission basis.
    """

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='lines',
    )

    visit_service = models.ForeignKey(
        VisitService,
        on_delete=models.PROTECT,
        related_name='invoice_lines',
    )

    service_name = models.CharField(max_length=150)
    service_code = models.CharField(max_length=30)
    service_category = models.CharField(max_length=20)

    quantity = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(ZERO)],
    )

    bargaining_discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    loyalty_discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    taxable_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(ZERO),
            MaxValueValidator(Decimal('100.00')),
        ],
    )

    vat_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    commission_base_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=ZERO,
        validators=[MinValueValidator(ZERO)],
    )

    zero_price_reason = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['invoice', 'visit_service'],
                name='unique_invoice_visit_service_line',
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name='invoice_line_quantity_positive',
            ),
            models.CheckConstraint(
                condition=Q(unit_price__gte=ZERO),
                name='invoice_line_unit_price_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(bargaining_discount__gte=ZERO),
                name='invoice_line_bargain_discount_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(loyalty_discount__gte=ZERO),
                name='invoice_line_loyalty_discount_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(taxable_amount__gte=ZERO),
                name='invoice_line_taxable_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(vat_amount__gte=ZERO),
                name='invoice_line_vat_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(line_total__gte=ZERO),
                name='invoice_line_total_nonnegative',
            ),
            models.CheckConstraint(
                condition=Q(commission_base_amount__gte=ZERO),
                name='invoice_line_commission_nonnegative',
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}
        gross_amount = self.quantity * self.unit_price

        if self.unit_price == ZERO and not self.zero_price_reason.strip():
            errors['zero_price_reason'] = (
                'A reason or promotion is required for a zero-priced service.'
            )

        if self.bargaining_discount > gross_amount:
            errors['bargaining_discount'] = (
                'The bargaining discount cannot exceed the original line amount.'
            )

        if self.loyalty_discount > (
            gross_amount - self.bargaining_discount
        ):
            errors['loyalty_discount'] = (
                'The loyalty discount cannot exceed the remaining amount '
                'after bargaining discount.'
            )

        expected_taxable = (
            gross_amount
            - self.bargaining_discount
            - self.loyalty_discount
        )

        expected_commission_base = (
            gross_amount - self.bargaining_discount
        )

        if self.taxable_amount != expected_taxable:
            errors['taxable_amount'] = (
                'Taxable amount must equal the original amount less '
                'bargaining and loyalty discounts.'
            )

        if self.commission_base_amount != expected_commission_base:
            errors['commission_base_amount'] = (
                'Commission base must equal the original amount less '
                'bargaining discount only.'
            )

        if self.vat_rate is None and self.vat_amount != ZERO:
            errors['vat_amount'] = (
                'VAT amount must be zero when no VAT rate is recorded.'
            )

        if self.invoice_id and self.visit_service_id:
            if self.invoice.visit_id != self.visit_service.visit_id:
                errors['visit_service'] = (
                    'The service must belong to the invoice visit.'
                )

            if self.invoice.branch_id != self.visit_service.visit.branch_id:
                errors['visit_service'] = (
                    'The service visit must belong to the invoice branch.'
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.service_name} - Invoice #{self.invoice_id}'


class PaymentCollection(models.Model):
    """
    One customer collection and one receipt.

    A collection can contain multiple payment entries, for example
    cash plus M-PESA. The invoice's unpaid balance remains on that
    invoice; it is not automatically transferred to a credit account.
    """

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='payment_collections',
    )

    receipt_number = models.CharField(
        max_length=50,
        unique=True,
    )

    idempotency_key = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='received_payment_collections',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['invoice', '-created_at'],
                name='pay_collection_invoice_idx',
            ),
        ]

    @property
    def total_received(self):
        payments_total = (
            self.entries.aggregate(total=Sum('amount'))['total']
            or ZERO
        )

        reversals_total = (
            PaymentReversal.objects.filter(
                payment_entry__collection=self,
            ).aggregate(total=Sum('amount'))['total']
            or ZERO
        )

        return payments_total - reversals_total

    def clean(self):
        super().clean()

        if self.invoice_id and self.invoice.status in (
            Invoice.Status.DRAFT,
            Invoice.Status.VOID,
        ):
            raise ValidationError({
                'invoice': 'Payments cannot be collected against a draft '
                           'or void invoice.'
            })

    def __str__(self):
        return self.receipt_number


class PaymentEntry(models.Model):
    """
    An individual tender line within a payment collection.
    """

    class Method(models.TextChoices):
        CASH = 'CASH', 'Cash'
        MPESA = 'MPESA', 'M-PESA'

    collection = models.ForeignKey(
        PaymentCollection,
        on_delete=models.PROTECT,
        related_name='entries',
    )

    method = models.CharField(
        max_length=10,
        choices=Method.choices,
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )

    # Required for M-PESA; optional for cash.
    reference = models.CharField(
        max_length=100,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=ZERO),
                name='payment_entry_amount_positive',
            ),
            models.UniqueConstraint(
                fields=['reference'],
                condition=(
                    Q(method='MPESA') & ~Q(reference='')
                ),
                name='unique_mpesa_payment_reference',
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}

        if self.amount is not None:
            if self.amount <= ZERO:
                errors['amount'] = 'Payment amount must be greater than zero.'

            elif self.amount.as_tuple().exponent < -2:
                errors['amount'] = (
                    'Payment amount cannot have more than two decimal places.'
                )

        if self.method == self.Method.MPESA and not self.reference.strip():
            errors['reference'] = (
                'An M-PESA transaction reference is required.'
            )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return (
            f'{self.get_method_display()} - '
            f'KES {self.amount} - Receipt {self.collection.receipt_number}'
        )


class PaymentReversal(models.Model):
    """
    Immutable audit record for a full or partial payment reversal.

    The original PaymentEntry is never deleted or edited.
    Multiple partial reversals are allowed, but their combined
    amount must not exceed the original payment.
    """

    payment_entry = models.ForeignKey(
        PaymentEntry,
        on_delete=models.PROTECT,
        related_name='reversals',
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )

    reason = models.CharField(max_length=255)

    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='payment_reversals',
    )

    idempotency_key = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=ZERO),
                name='payment_reversal_amount_positive',
            ),
        ]

    def clean(self):
        super().clean()

        errors = {}

        if self.amount is not None:
            if self.amount <= ZERO:
                errors['amount'] = (
                    'Reversal amount must be greater than zero.'
                )

            elif self.amount.as_tuple().exponent < -2:
                errors['amount'] = (
                    'Reversal amount cannot have more than two decimal places.'
                )

        if not self.reason or not self.reason.strip():
            errors['reason'] = 'A reversal reason is required.'

        if self.payment_entry_id and self.amount is not None:
            payment = PaymentEntry.objects.get(
                pk=self.payment_entry_id,
            )

            previous_reversals = (
                PaymentReversal.objects.filter(
                    payment_entry_id=self.payment_entry_id,
                )
                .exclude(pk=self.pk)
                .aggregate(total=Sum('amount'))['total']
                or ZERO
            )

            if previous_reversals + self.amount > payment.amount:
                errors['amount'] = (
                    'Total reversals cannot exceed the original payment.'
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError(
            'Payment reversals cannot be deleted.'
        )

    def __str__(self):
        return (
            f'Reversal of payment #{self.payment_entry_id} '
            f'- KES {self.amount}'
        )
