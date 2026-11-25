
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class ExpenseCategory(models.Model):
    """
    Expense categories can be shared by all branches or assigned
    to one specific branch.
    """

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    # NULL means this is a shared category.
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.PROTECT,
        related_name="expense_categories",
        null=True,
        blank=True,
    )

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_expense_categories",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "name"],
                condition=Q(branch__isnull=False),
                name="unique_branch_expense_category",
            ),
            models.UniqueConstraint(
                Lower("name"),
                condition=Q(branch__isnull=True),
                name="unique_shared_expense_category_name",
            ),
        ]

    def __str__(self):
        if self.branch_id:
            return f"{self.name} - {self.branch.name}"
        return f"{self.name} (Shared)"

    def clean(self):
        self.name = self.name.strip()

        if not self.name:
            raise ValidationError({
                "name": "Category name is required."
            })


class Expense(models.Model):
    """
    A business expense recorded against a particular branch.

    Expenses are submitted for approval. Approval workflow and
    role-based restrictions are implemented in the API layer.
    """

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank Transfer"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        VOIDED = "VOIDED", "Voided"

    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.PROTECT,
        related_name="expenses",
    )

    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="expenses",
    )

    expense_date = models.DateField()

    description = models.CharField(max_length=255)

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
    )

    receipt_number = models.CharField(
        max_length=100,
        blank=True,
    )

    payment_reference = models.CharField(
        max_length=150,
        blank=True,
    )

    notes = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_expenses",
    )

    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_expenses",
        null=True,
        blank=True,
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="rejected_expenses",
        null=True,
        blank=True,
    )

    rejected_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    rejection_reason = models.TextField(blank=True)

    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="voided_expenses",
        null=True,
        blank=True,
    )

    voided_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    void_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(
                fields=["branch", "expense_date"],
                name="expense_branch_date_idx",
            ),
            models.Index(
                fields=["branch", "status"],
                name="expense_branch_status_idx",
            ),
            models.Index(
                fields=["category", "expense_date"],
                name="expense_category_date_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="expense_amount_must_be_positive",
            ),
        ]

    def __str__(self):
        return (
            f"{self.branch.name} - {self.description} "
            f"(KES {self.amount})"
        )

    def clean(self):
        errors = {}

        if self.description:
            self.description = self.description.strip()

        if not self.description:
            errors["description"] = "Expense description is required."

        if self.category_id and self.branch_id:
            category_branch_id = self.category.branch_id

            # Shared categories are allowed for every branch.
            if (
                category_branch_id is not None
                and category_branch_id != self.branch_id
            ):
                errors["category"] = (
                    "This expense category belongs to another branch."
                )

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Expense amount must be greater than zero."

        if self.status == self.Status.APPROVED:
            if not self.approved_by_id or not self.approved_at:
                errors["status"] = (
                    "Approved expenses must have an approver and "
                    "approval timestamp."
                )

        if self.status == self.Status.REJECTED:
            if not self.rejected_by_id or not self.rejected_at:
                errors["status"] = (
                    "Rejected expenses must have a reviewer and "
                    "rejection timestamp."
                )

            if not self.rejection_reason.strip():
                errors["rejection_reason"] = (
                    "A rejection reason is required."
                )

        if self.status == self.Status.VOIDED:
            if not self.voided_by_id or not self.voided_at:
                errors["status"] = (
                    "Voided expenses must have an actor and "
                    "void timestamp."
                )

            if not self.void_reason.strip():
                errors["void_reason"] = "A void reason is required."

        if errors:
            raise ValidationError(errors)


class ExpenseApprovalHistory(models.Model):
    """
    Records important actions taken on an expense.

    History records are retained for accountability and auditing.
    """

    class Action(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted for Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        VOIDED = "VOIDED", "Voided"
        EDITED = "EDITED", "Edited"

    expense = models.ForeignKey(
        Expense,
        on_delete=models.PROTECT,
        related_name="approval_history",
    )

    action = models.CharField(
        max_length=20,
        choices=Action.choices,
    )

    previous_status = models.CharField(
        max_length=20,
        choices=Expense.Status.choices,
        blank=True,
    )

    new_status = models.CharField(
        max_length=20,
        choices=Expense.Status.choices,
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="expense_history_actions",
    )

    comments = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["expense", "created_at"],
                name="expense_history_date_idx",
            ),
        ]

    def __str__(self):
        return (
            f"{self.expense_id} - {self.get_action_display()} "
            f"by {self.performed_by}"
        )


class ExpenseBudget(models.Model):
    """
    A budget for a branch over a defined period.

    A NULL category represents the overall branch expense budget.
    A selected category represents a category-specific budget.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING = "PENDING", "Pending Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.PROTECT,
        related_name="expense_budgets",
    )

    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="budgets",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=150)

    period_start = models.DateField()
    period_end = models.DateField()

    budget_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_expense_budgets",
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_expense_budgets",
        null=True,
        blank=True,
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    rejection_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_start", "branch"]
        indexes = [
            models.Index(
                fields=["branch", "period_start", "period_end"],
                name="expense_budget_period_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(budget_amount__gt=0),
                name="expense_budget_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(period_end__gte=models.F("period_start")),
                name="expense_budget_valid_period",
            ),
        ]

    def __str__(self):
        return (
            f"{self.name} - {self.branch.name} "
            f"(KES {self.budget_amount})"
        )

    def clean(self):
        errors = {}

        if self.period_start and self.period_end:
            if self.period_end < self.period_start:
                errors["period_end"] = (
                    "Budget end date cannot be before its start date."
                )

        if self.budget_amount is not None and self.budget_amount <= 0:
            errors["budget_amount"] = (
                "Budget amount must be greater than zero."
            )

        if self.category_id and self.branch_id:
            category_branch_id = self.category.branch_id

            if (
                category_branch_id is not None
                and category_branch_id != self.branch_id
            ):
                errors["category"] = (
                    "This category belongs to another branch."
                )

        if self.status == self.Status.APPROVED:
            if not self.approved_by_id or not self.approved_at:
                errors["status"] = (
                    "Approved budgets must have an approver "
                    "and approval timestamp."
                )

        if self.status == self.Status.REJECTED:
            if not self.rejection_reason.strip():
                errors["rejection_reason"] = (
                    "A rejection reason is required."
                )

        if errors:
            raise ValidationError(errors)
