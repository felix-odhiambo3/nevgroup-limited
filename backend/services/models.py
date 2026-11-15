
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from branches.models import Branch


class Service(models.Model):

    class Category(models.TextChoices):
        CAR_WASH = 'CAR_WASH', 'Car Wash'
        DETAILING = 'DETAILING', 'Detailing'

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

    # Legacy catalogue price.
    # Actual visit prices will come from BranchServicePrice.
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
        return f"{self.name} - KES {self.price}"

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

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    # Required whenever price is zero.
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
                condition=models.Q(price__gte=0),
                name='branch_service_price_nonnegative'
            ),
        ]

    def clean(self):
        super().clean()

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
            f"{self.branch.name} - "
            f"{self.service.name}: KES {self.price}"
        )
