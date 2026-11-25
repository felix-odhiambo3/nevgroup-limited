
from django.contrib import admin

from .models import (
    Expense,
    ExpenseApprovalHistory,
    ExpenseBudget,
    ExpenseCategory,
)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "branch",
        "is_active",
        "created_by",
        "created_at",
    )

    list_filter = (
        "is_active",
        "branch",
    )

    search_fields = (
        "name",
        "description",
        "branch__name",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    ordering = ("name",)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "description",
        "branch",
        "category",
        "amount",
        "payment_method",
        "expense_date",
        "status",
        "recorded_by",
    )

    list_filter = (
        "status",
        "payment_method",
        "branch",
        "category",
        "expense_date",
    )

    search_fields = (
        "description",
        "receipt_number",
        "payment_reference",
        "branch__name",
        "category__name",
        "recorded_by__username",
    )

    date_hierarchy = "expense_date"

    ordering = ("-expense_date", "-created_at")

    readonly_fields = tuple(
        field.name for field in Expense._meta.fields
    )

    def has_add_permission(self, request):
        # Expenses must be created through the controlled workflow.
        return False

    def has_change_permission(self, request, obj=None):
        # Protect approval and financial records from direct editing.
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        # Preserve expense records for audit purposes.
        return False


@admin.register(ExpenseApprovalHistory)
class ExpenseApprovalHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "expense",
        "action",
        "previous_status",
        "new_status",
        "performed_by",
        "created_at",
    )

    list_filter = (
        "action",
        "previous_status",
        "new_status",
        "created_at",
    )

    search_fields = (
        "expense__description",
        "expense__branch__name",
        "performed_by__username",
        "comments",
    )

    date_hierarchy = "created_at"

    readonly_fields = tuple(
        field.name for field in ExpenseApprovalHistory._meta.fields
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ExpenseBudget)
class ExpenseBudgetAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "branch",
        "category",
        "budget_amount",
        "period_start",
        "period_end",
        "status",
        "created_by",
        "approved_by",
    )

    list_filter = (
        "status",
        "branch",
        "category",
        "period_start",
    )

    search_fields = (
        "name",
        "branch__name",
        "category__name",
        "created_by__username",
    )

    date_hierarchy = "period_start"

    ordering = ("-period_start",)

    readonly_fields = tuple(
        field.name for field in ExpenseBudget._meta.fields
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return False
