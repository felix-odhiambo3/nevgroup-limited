
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings
from django.core.exceptions import ValidationError


class Branch(models.Model):

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20, unique=True)

    town = models.CharField(max_length=100)
    address = models.CharField(max_length=255, blank=True)

    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)

    # Daily revenue target in Kenyan Shillings (KES).
    daily_revenue_target = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Daily branch revenue target in KES.",
    )

    # GPS attendance configuration
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(-90),
            MaxValueValidator(90),
        ],
    )

    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(-180),
            MaxValueValidator(180),
        ],
    )

    attendance_radius = models.PositiveIntegerField(
        default=100,
        validators=[MinValueValidator(1)],
        help_text="Maximum permitted attendance distance in metres.",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Branches'

    def __str__(self):
        return f"{self.name} ({self.code})"

class BranchLocationAudit(models.Model):
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='location_audit_logs',
    )

    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branch_location_changes',
    )

    old_latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
    )

    old_longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
    )

    new_latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
    )

    new_longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
    )

    old_attendance_radius = models.PositiveIntegerField()
    new_attendance_radius = models.PositiveIntegerField()

    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']
        verbose_name = 'Branch GPS Change'
        verbose_name_plural = 'Branch GPS Changes'

    def __str__(self):
        return (
            f'{self.branch.name} GPS change '
            f'at {self.changed_at}'
        )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                'GPS audit records cannot be modified.'
            )

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError(
            'GPS audit records cannot be deleted.'
        )