
from rest_framework import serializers

from .models import (
    Expense,
    ExpenseApprovalHistory,
    ExpenseBudget,
    ExpenseCategory,
)


class ExpenseCategorySerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    class Meta:
        model = ExpenseCategory
        fields = [
            "id",
            "name",
            "description",
            "branch",
            "branch_name",
            "is_active",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Category name is required."
            )

        return value


class ExpenseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    recorded_by_name = serializers.CharField(
        source="recorded_by.username",
        read_only=True,
    )

    approved_by_name = serializers.CharField(
        source="approved_by.username",
        read_only=True,
    )

    rejected_by_name = serializers.CharField(
        source="rejected_by.username",
        read_only=True,
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "branch",
            "branch_name",
            "category",
            "category_name",
            "expense_date",
            "description",
            "amount",
            "payment_method",
            "receipt_number",
            "payment_reference",
            "notes",
            "status",
            "recorded_by",
            "recorded_by_name",
            "submitted_at",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "rejected_by",
            "rejected_by_name",
            "rejected_at",
            "rejection_reason",
            "voided_by",
            "voided_at",
            "void_reason",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "status",
            "recorded_by",
            "submitted_at",
            "approved_by",
            "approved_at",
            "rejected_by",
            "rejected_at",
            "rejection_reason",
            "voided_by",
            "voided_at",
            "void_reason",
            "created_at",
            "updated_at",
        ]

    def validate_description(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Expense description is required."
            )

        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Expense amount must be greater than zero."
            )

        return value

    def validate(self, attrs):
        branch = attrs.get(
            "branch",
            getattr(self.instance, "branch", None),
        )

        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )

        if branch and category:
            if (
                category.branch_id is not None
                and category.branch_id != branch.id
            ):
                raise serializers.ValidationError({
                    "category": (
                        "This category belongs to another branch."
                    )
                })

        if self.instance:
            if self.instance.status != Expense.Status.DRAFT:
                raise serializers.ValidationError(
                    "Only draft expenses can be edited."
                )

        return attrs


class ExpenseApprovalHistorySerializer(
    serializers.ModelSerializer
):
    performed_by_name = serializers.CharField(
        source="performed_by.username",
        read_only=True,
    )

    class Meta:
        model = ExpenseApprovalHistory
        fields = [
            "id",
            "expense",
            "action",
            "previous_status",
            "new_status",
            "performed_by",
            "performed_by_name",
            "comments",
            "created_at",
        ]

        read_only_fields = fields


class ExpenseBudgetSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True,
    )

    approved_by_name = serializers.CharField(
        source="approved_by.username",
        read_only=True,
    )

    class Meta:
        model = ExpenseBudget
        fields = [
            "id",
            "branch",
            "branch_name",
            "category",
            "category_name",
            "name",
            "period_start",
            "period_end",
            "budget_amount",
            "status",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "status",
            "created_by",
            "approved_by",
            "approved_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]

    def validate_budget_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Budget amount must be greater than zero."
            )

        return value

    def validate(self, attrs):
        start = attrs.get(
            "period_start",
            getattr(self.instance, "period_start", None),
        )

        end = attrs.get(
            "period_end",
            getattr(self.instance, "period_end", None),
        )

        branch = attrs.get(
            "branch",
            getattr(self.instance, "branch", None),
        )

        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )

        if start and end and end < start:
            raise serializers.ValidationError({
                "period_end": (
                    "Budget end date cannot be before its start date."
                )
            })

        if branch and category:
            if (
                category.branch_id is not None
                and category.branch_id != branch.id
            ):
                raise serializers.ValidationError({
                    "category": (
                        "This category belongs to another branch."
                    )
                })

        if self.instance:
            if self.instance.status != ExpenseBudget.Status.DRAFT:
                raise serializers.ValidationError(
                    "Only draft budgets can be edited."
                )

        return attrs
