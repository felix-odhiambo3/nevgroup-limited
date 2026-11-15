
from django.conf import settings
from django.db import models

from staff.models import StaffProfile

from .models import ServiceAssignment

class ServiceAssignmentCorrection(models.Model):
    """
    Auditable correction of the employee recorded on a completed
    service assignment. The original and replacement employees
    are both preserved.
    """

    assignment = models.ForeignKey(
        ServiceAssignment,
        on_delete=models.PROTECT,
        related_name='corrections',
    )

    previous_staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.PROTECT,
        related_name='assignment_corrections_from',
    )

    new_staff = models.ForeignKey(
        StaffProfile,
        on_delete=models.PROTECT,
        related_name='assignment_corrections_to',
    )

    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='service_assignment_corrections',
    )

    reason = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f'Assignment #{self.assignment_id}: '
            f'{self.previous_staff.staff_number} to '
            f'{self.new_staff.staff_number}'
        )