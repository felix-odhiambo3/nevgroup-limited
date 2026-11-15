from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models


class User(AbstractUser):

    class Role(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        ADMIN = 'ADMIN', 'Admin'
        SUPERVISOR = 'SUPERVISOR', 'Supervisor'
        ACCOUNTS = 'ACCOUNTS', 'Accounts'
        CLEANER = 'CLEANER', 'Cleaner'
        DETAILER = 'DETAILER', 'Detailer'

    email = models.EmailField(unique=True)

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CLEANER,
    )

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class UserRoleHistory(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='role_history',
    )

    previous_role = models.CharField(
        max_length=20,
        choices=User.Role.choices,
    )

    new_role = models.CharField(
        max_length=20,
        choices=User.Role.choices,
    )

    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='role_changes_made',
    )

    reason = models.TextField(max_length=2000)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return (
            f"{self.user.username}: "
            f"{self.previous_role} → {self.new_role}"
        )