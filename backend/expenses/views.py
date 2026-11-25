
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from branches.models import Branch

from .models import (
    Expense,
    ExpenseApprovalHistory,
    ExpenseBudget,
    ExpenseCategory,
)

from .serializers import (
    ExpenseApprovalHistorySerializer,
    ExpenseBudgetSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
)

from .access import (
    get_assigned_branch_id,
    is_global_expense_user,
    get_expense_branch_scope,
)


def is_global_user(user):
    return is_global_expense_user(user)


def get_user_branch(user):
    return get_assigned_branch_id(user)


def require_expense_access(user):
    if is_global_user(user):
        return None

    if getattr(user, "role", None) in {"ACCOUNTS", "SUPERVISOR"}:
        branch_id = get_user_branch(user)

        if branch_id:
            return branch_id

    raise PermissionDenied(
        "You do not have permission to access expense management."
    )


def require_management_access(user):
    if not is_global_user(user):
        raise PermissionDenied(
            "Only OWNER or ADMIN can perform this action."
        )


def validate_branch_access(user, branch):
    if not branch or not branch.is_active:
        raise ValidationError({
            "branch": "Select a valid active branch."
        })

    if is_global_user(user):
        return

    assigned_branch_id = get_user_branch(user)

    if assigned_branch_id != branch.id:
        raise PermissionDenied(
            "You can only manage expenses for your assigned branch."
        )


def add_expense_history(
    expense,
    action,
    previous_status,
    new_status,
    performed_by,
    comments="",
):
    return ExpenseApprovalHistory.objects.create(
        expense=expense,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        performed_by=performed_by,
        comments=comments,
    )


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if is_global_user(user):
            return ExpenseCategory.objects.select_related(
                "branch",
                "created_by",
            ).all()

        branch_id = require_expense_access(user)

        return ExpenseCategory.objects.select_related(
            "branch",
            "created_by",
        ).filter(
            models_q_shared_or_branch(branch_id)
        )

    def perform_create(self, serializer):
        require_management_access(self.request.user)

        branch = serializer.validated_data.get("branch")

        if branch:
            validate_branch_access(self.request.user, branch)

        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        require_management_access(self.request.user)

        branch = serializer.validated_data.get(
            "branch",
            serializer.instance.branch,
        )

        if branch:
            validate_branch_access(self.request.user, branch)

        serializer.save()

    def destroy(self, request, *args, **kwargs):
        require_management_access(request.user)

        category = self.get_object()

        if category.expenses.exists() or category.budgets.exists():
            category.is_active = False
            category.save(update_fields=["is_active", "updated_at"])

            return Response(
                {
                    "detail": (
                        "Category is in use and has been deactivated "
                        "instead of deleted."
                    )
                },
                status=status.HTTP_200_OK,
            )

        return super().destroy(request, *args, **kwargs)


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user

        queryset = Expense.objects.select_related(
            "branch",
            "category",
            "recorded_by",
            "approved_by",
            "rejected_by",
            "voided_by",
        ).prefetch_related("approval_history")

        if is_global_user(user):
            pass
        else:
            branch_id = require_expense_access(user)
            queryset = queryset.filter(branch_id=branch_id)

        branch_filter = self.request.query_params.get("branch")
        status_filter = self.request.query_params.get("status")
        category_filter = self.request.query_params.get("category")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if branch_filter:
            queryset = queryset.filter(branch_id=branch_filter)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if category_filter:
            queryset = queryset.filter(category_id=category_filter)

        if date_from:
            queryset = queryset.filter(expense_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(expense_date__lte=date_to)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        branch_scope = require_expense_access(user)

        requested_branch = serializer.validated_data.get("branch")

        if branch_scope is not None:
            branch = get_object_or_404(
                Branch,
                pk=branch_scope,
                is_active=True,
            )

            if requested_branch and requested_branch.id != branch.id:
                raise PermissionDenied(
                    "You cannot record an expense for another branch."
                )
        else:
            branch = requested_branch

            if not branch:
                raise ValidationError({
                    "branch": "A branch is required."
                })

            validate_branch_access(user, branch)

        serializer.save(
            branch=branch,
            recorded_by=user,
            status=Expense.Status.DRAFT,
        )

    def perform_update(self, serializer):
        expense = serializer.instance
        user = self.request.user

        if expense.status != Expense.Status.DRAFT:
            raise ValidationError(
                "Only draft expenses can be edited."
            )

        if (
            not is_global_user(user)
            and expense.recorded_by_id != user.id
        ):
            raise PermissionDenied(
                "You can only edit your own draft expenses."
            )

        serializer.save()

        add_expense_history(
            expense=expense,
            action=ExpenseApprovalHistory.Action.EDITED,
            previous_status=Expense.Status.DRAFT,
            new_status=Expense.Status.DRAFT,
            performed_by=user,
            comments="Draft expense updated.",
        )

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied(
            "Expenses cannot be deleted. Use the approval or void workflow."
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def submit(self, request, pk=None):
        expense = self.get_object()
        user = request.user

        if expense.status != Expense.Status.DRAFT:
            raise ValidationError(
                "Only draft expenses can be submitted."
            )

        if (
            not is_global_user(user)
            and expense.recorded_by_id != user.id
        ):
            raise PermissionDenied(
                "You can only submit your own draft expenses."
            )

        previous_status = expense.status

        expense.status = Expense.Status.PENDING
        expense.submitted_at = timezone.now()

        expense.full_clean()
        expense.save(
            update_fields=[
                "status",
                "submitted_at",
                "updated_at",
            ]
        )

        add_expense_history(
            expense,
            ExpenseApprovalHistory.Action.SUBMITTED,
            previous_status,
            expense.status,
            user,
            request.data.get("comments", ""),
        )

        return Response(
            ExpenseSerializer(expense).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        require_management_access(request.user)

        expense = self.get_object()
        user = request.user

        if expense.status != Expense.Status.PENDING:
            raise ValidationError(
                "Only pending expenses can be approved."
            )

        if expense.recorded_by_id == user.id:
            raise PermissionDenied(
                "You cannot approve an expense you recorded."
            )

        previous_status = expense.status

        expense.status = Expense.Status.APPROVED
        expense.approved_by = user
        expense.approved_at = timezone.now()
        expense.rejected_by = None
        expense.rejected_at = None
        expense.rejection_reason = ""

        expense.full_clean()
        expense.save()

        add_expense_history(
            expense,
            ExpenseApprovalHistory.Action.APPROVED,
            previous_status,
            expense.status,
            user,
            request.data.get("comments", ""),
        )

        return Response(
            ExpenseSerializer(expense).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        require_management_access(request.user)

        expense = self.get_object()
        user = request.user

        if expense.status != Expense.Status.PENDING:
            raise ValidationError(
                "Only pending expenses can be rejected."
            )

        if expense.recorded_by_id == user.id:
            raise PermissionDenied(
                "You cannot reject your own expense submission."
            )

        reason = str(request.data.get("reason", "")).strip()

        if not reason:
            raise ValidationError({
                "reason": "A rejection reason is required."
            })

        previous_status = expense.status

        expense.status = Expense.Status.REJECTED
        expense.rejected_by = user
        expense.rejected_at = timezone.now()
        expense.rejection_reason = reason

        expense.full_clean()
        expense.save()

        add_expense_history(
            expense,
            ExpenseApprovalHistory.Action.REJECTED,
            previous_status,
            expense.status,
            user,
            reason,
        )

        return Response(
            ExpenseSerializer(expense).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def void(self, request, pk=None):
        require_management_access(request.user)

        expense = self.get_object()

        if expense.status != Expense.Status.APPROVED:
            raise ValidationError(
                "Only approved expenses can be voided."
            )

        reason = str(request.data.get("reason", "")).strip()

        if not reason:
            raise ValidationError({
                "reason": "A void reason is required."
            })

        previous_status = expense.status

        expense.status = Expense.Status.VOIDED
        expense.voided_by = request.user
        expense.voided_at = timezone.now()
        expense.void_reason = reason

        expense.full_clean()
        expense.save()

        add_expense_history(
            expense,
            ExpenseApprovalHistory.Action.VOIDED,
            previous_status,
            expense.status,
            request.user,
            reason,
        )

        return Response(
            ExpenseSerializer(expense).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        expense = self.get_object()

        history = expense.approval_history.select_related(
            "performed_by"
        ).all()

        serializer = ExpenseApprovalHistorySerializer(
            history,
            many=True,
        )

        return Response(serializer.data)


class ExpenseBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseBudgetSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        require_management_access(self.request.user)

        queryset = ExpenseBudget.objects.select_related(
            "branch",
            "category",
            "created_by",
            "approved_by",
        ).all()

        branch_filter = self.request.query_params.get("branch")

        if branch_filter:
            queryset = queryset.filter(branch_id=branch_filter)

        return queryset

    def perform_create(self, serializer):
        require_management_access(self.request.user)

        branch = serializer.validated_data.get("branch")
        validate_branch_access(self.request.user, branch)

        serializer.save(
            created_by=self.request.user,
            status=ExpenseBudget.Status.DRAFT,
        )

    def perform_update(self, serializer):
        require_management_access(self.request.user)

        if serializer.instance.status != ExpenseBudget.Status.DRAFT:
            raise ValidationError(
                "Only draft budgets can be edited."
            )

        branch = serializer.validated_data.get(
            "branch",
            serializer.instance.branch,
        )

        validate_branch_access(self.request.user, branch)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied(
            "Budgets cannot be deleted. Retain them for audit purposes."
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def submit(self, request, pk=None):
        require_management_access(request.user)

        budget = self.get_object()

        if budget.status != ExpenseBudget.Status.DRAFT:
            raise ValidationError(
                "Only draft budgets can be submitted."
            )

        budget.status = ExpenseBudget.Status.PENDING
        budget.save(update_fields=["status", "updated_at"])

        return Response(
            ExpenseBudgetSerializer(budget).data
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        require_management_access(request.user)

        budget = self.get_object()

        if budget.status != ExpenseBudget.Status.PENDING:
            raise ValidationError(
                "Only pending budgets can be approved."
            )

        if budget.created_by_id == request.user.id:
            raise PermissionDenied(
                "You cannot approve a budget you created."
            )

        budget.status = ExpenseBudget.Status.APPROVED
        budget.approved_by = request.user
        budget.approved_at = timezone.now()
        budget.rejection_reason = ""

        budget.full_clean()
        budget.save()

        return Response(
            ExpenseBudgetSerializer(budget).data
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        require_management_access(request.user)

        budget = self.get_object()

        if budget.status != ExpenseBudget.Status.PENDING:
            raise ValidationError(
                "Only pending budgets can be rejected."
            )

        if budget.created_by_id == request.user.id:
            raise PermissionDenied(
                "You cannot reject a budget you created."
            )

        reason = str(request.data.get("reason", "")).strip()

        if not reason:
            raise ValidationError({
                "reason": "A rejection reason is required."
            })

        budget.status = ExpenseBudget.Status.REJECTED
        budget.rejection_reason = reason

        budget.full_clean()
        budget.save()

        return Response(
            ExpenseBudgetSerializer(budget).data
        )


def models_q_shared_or_branch(branch_id):
    from django.db.models import Q

    return Q(branch__isnull=True) | Q(branch_id=branch_id)
