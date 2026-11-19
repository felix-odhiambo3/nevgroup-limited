
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from branches.models import Branch
from vehicles.models import VehicleCategory


class Service(models.Model):

    class Category(models.TextChoices):
        CAR_WASH = 'CAR_WASH', 'Car Wash'
        DETAILING = 'DETAILING', 'Detailing'

    class PricingMode(models.TextChoices):
        FIXED = 'FIXED', 'Fixed Branch Price'
        VEHICLE_CATEGORY = 'VEHICLE_CATEGORY', 'Vehicle Category Price'
        SUPERVISOR_SET = 'SUPERVISOR_SET', 'Supervisor Sets Price'

    name = models.CharField(max_length=150)

    code = models.CharField(
        max_length=30,
        unique=True
    )

    category = models.CharField(
        max_length=20,
        choices=Category.choices
    )

    description = models.TextField(blank=True)

    pricing_mode = models.CharField(
        max_length=20,
        choices=PricingMode.choices,
        default=PricingMode.FIXED
    )

    # Legacy catalogue price. Actual visit prices are snapshotted
    # from the applicable branch/category/visit pricing rule.
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True
    )

    requires_timer = models.BooleanField(default=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} - {self.get_pricing_mode_display()}"

    def save(self, *args, **kwargs):
        if self.category == self.Category.DETAILING:
            self.requires_timer = False

        super().save(*args, **kwargs)


class BranchServicePrice(models.Model):

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='service_prices'
    )

    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name='branch_prices'
    )

    # NULL for VEHICLE_CATEGORY and SUPERVISOR_SET services.
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True
    )

    zero_price_reason = models.CharField(
        max_length=255,
        blank=True
    )

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_service_prices_created'
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_service_prices_updated'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['branch__name', 'service__name']

        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'service'],
                name='unique_branch_service_price'
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(price__isnull=True)
                    | models.Q(price__gte=0)
                ),
                name='branch_service_price_nonnegative'
            ),
        ]

    def clean(self):
        super().clean()

        if not self.service_id:
            return

        pricing_mode = self.service.pricing_mode

        if pricing_mode == Service.PricingMode.FIXED:
            if self.price is None:
                raise ValidationError({
                    'price': 'A fixed-price service must have a price.'
                })

            if self.price == 0 and not self.zero_price_reason.strip():
                raise ValidationError({
                    'zero_price_reason': (
                        'A reason or promotion must be recorded '
                        'for a zero-priced service.'
                    )
                })

            if self.price > 0:
                self.zero_price_reason = ''

        else:
            if self.price is not None:
                raise ValidationError({
                    'price': (
                        'This pricing method does not use a fixed '
                        'branch price.'
                    )
                })

            self.zero_price_reason = ''

    def __str__(self):
        if self.price is None:
            price_display = self.service.get_pricing_mode_display()
        else:
            price_display = f"KES {self.price}"

        return (
            f"{self.branch.name} - "
            f"{self.service.name}: {price_display}"
        )


class BranchServiceCategoryPrice(models.Model):

    branch_service_price = models.ForeignKey(
        BranchServicePrice,
        on_delete=models.PROTECT,
        related_name='category_prices'
    )

    vehicle_category = models.ForeignKey(
        VehicleCategory,
        on_delete=models.PROTECT,
        related_name='branch_service_prices'
    )

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    zero_price_reason = models.CharField(
        max_length=255,
        blank=True
    )

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_service_category_prices_created'
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_service_category_prices_updated'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            'branch_service_price__branch__name',
            'vehicle_category__name'
        ]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    'branch_service_price',
                    'vehicle_category'
                ],
                name='unique_branch_service_vehicle_category_price'
            ),
            models.CheckConstraint(
                condition=models.Q(price__gte=0),
                name='branch_service_category_price_nonnegative'
            ),
        ]

    def clean(self):
        super().clean()

        if self.branch_service_price_id:
            service = self.branch_service_price.service

            if service.pricing_mode != Service.PricingMode.VEHICLE_CATEGORY:
                raise ValidationError({
                    'branch_service_price': (
                        'Category prices can only be created for '
                        'vehicle-category-priced services.'
                    )
                })

            if self.branch_service_price.price is not None:
                raise ValidationError({
                    'branch_service_price': (
                        'The parent branch service price must not '
                        'contain a fixed price.'
                    )
                })

        if self.price == 0 and not self.zero_price_reason.strip():
            raise ValidationError({
                'zero_price_reason': (
                    'A reason or promotion must be recorded '
                    'for a zero-priced service.'
                )
            })

        if self.price > 0:
            self.zero_price_reason = ''

    def __str__(self):
        return (
            f"{self.branch_service_price.branch.name} - "
            f"{self.branch_service_price.service.name} - "
            f"{self.vehicle_category.name}: KES {self.price}"
        )
