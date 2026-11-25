
from rest_framework.permissions import BasePermission

from staff.models import StaffProfile


OWNER_ROLES = {'OWNER'}
ADMIN_ROLES = {'ADMIN'}
ACCOUNTS_ROLES = {'ACCOUNTS'}
SUPERVISOR_ROLES = {'SUPERVISOR'}


def is_global_analytics_user(user):
    """OWNER, ADMIN and superusers can access every branch."""
    return (
        user.is_authenticated
        and (
            user.is_superuser
            or getattr(user, 'role', None) in OWNER_ROLES | ADMIN_ROLES
        )
    )


def get_assigned_branch_id(user):
    """
    Resolve the user's active staff profile and assigned active branch.

    Missing, archived, inactive or unassigned profiles grant no access.
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
        .values_list('branch_id', flat=True)
        .first()
    )


def get_analytics_branch_scope(user):
    """
    Return:
      None  -> all branches
      int   -> one assigned branch
      False -> no branch access
    """
    if not user or not user.is_authenticated:
        return False

    if is_global_analytics_user(user):
        return None

    role = getattr(user, 'role', None)

    if role in ACCOUNTS_ROLES | SUPERVISOR_ROLES:
        branch_id = get_assigned_branch_id(user)
        return branch_id if branch_id is not None else False

    return False


def scope_queryset_to_user(queryset, user, branch_field='branch_id'):
    """
    Apply the user's analytics branch restriction to a queryset.

    Global users receive the original queryset.
    Assigned-branch users receive only their branch.
    All other users receive an empty queryset.
    """
    branch_scope = get_analytics_branch_scope(user)

    if branch_scope is None:
        return queryset

    if branch_scope is False:
        return queryset.none()

    return queryset.filter(**{branch_field: branch_scope})


class CanAccessFinancialAnalytics(BasePermission):
    """
    Financial analytics:
      - OWNER / superuser: all branches
      - ADMIN: all branches
      - ACCOUNTS: assigned branch only
      - Other roles: denied
    """

    message = 'You do not have permission to access financial analytics.'

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if is_global_analytics_user(user):
            return True

        if getattr(user, 'role', None) == 'ACCOUNTS':
            return get_assigned_branch_id(user) is not None

        return False


class CanAccessOperationalAnalytics(BasePermission):
    """
    Operational analytics:
      - OWNER / superuser: all branches
      - ADMIN: all branches
      - SUPERVISOR: assigned branch only
      - ACCOUNTS, CLEANER and DETAILER: denied
    """

    message = 'You do not have permission to access operational analytics.'

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if is_global_analytics_user(user):
            return True

        if getattr(user, 'role', None) == 'SUPERVISOR':
            return get_assigned_branch_id(user) is not None

        return False
