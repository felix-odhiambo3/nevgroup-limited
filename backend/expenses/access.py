
from rest_framework.permissions import BasePermission

from staff.models import StaffProfile


GLOBAL_EXPENSE_ROLES = {"OWNER", "ADMIN"}

EXPENSE_BRANCH_ROLES = {"ACCOUNTS", "SUPERVISOR"}


def is_global_expense_user(user):
    """
    OWNER, ADMIN and superusers can manage expenses
    across all branches.
    """
    if not user or not user.is_authenticated:
        return False

    return (
        user.is_superuser
        or getattr(user, "role", None) in GLOBAL_EXPENSE_ROLES
    )


def get_assigned_branch_id(user):
    """
    Return the user's active branch.

    A user without an active, non-archived staff profile
    cannot access branch-specific expense records.
    """
    if not user or not user.is_authenticated:
        return None

    return (
        StaffProfile.objects.filter(
            user_id=user.pk,
            is_archived=False,
            employment_status=StaffProfile.EmploymentStatus.ACTIVE,
            branch__is_active=True,
        )
        .values_list("branch_id", flat=True)
        .first()
    )


def get_expense_branch_scope(user):
    """
    Return:
        None  -> global branch access
        int   -> assigned branch only
        False -> no expense access
    """
    if not user or not user.is_authenticated:
        return False

    if is_global_expense_user(user):
        return None

    if getattr(user, "role", None) in EXPENSE_BRANCH_ROLES:
        branch_id = get_assigned_branch_id(user)

        if branch_id is not None:
            return branch_id

    return False


class CanAccessExpenseManagement(BasePermission):
    """
    OWNER / ADMIN:
        All branches.

    ACCOUNTS / SUPERVISOR:
        Assigned branch only.

    CLEANER / DETAILER:
        No access.
    """

    message = (
        "You do not have permission to access expense management."
    )

    def has_permission(self, request, view):
        return get_expense_branch_scope(request.user) is not False


class CanManageExpensesGlobally(BasePermission):
    """
    Only OWNER, ADMIN and superusers can perform
    global expense-management actions.
    """

    message = (
        "Only OWNER or ADMIN can perform this action."
    )

    def has_permission(self, request, view):
        return is_global_expense_user(request.user)
