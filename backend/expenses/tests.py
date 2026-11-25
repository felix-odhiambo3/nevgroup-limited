
from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from branches.models import Branch
from staff.models import StaffProfile

from .models import (
    Expense,
    ExpenseApprovalHistory,
    ExpenseBudget,
    ExpenseCategory,
)


class ExpenseAPITestBase(APITestCase):
    """Shared test setup for expense API tests."""

    def setUp(self):
        self.branch = Branch.objects.create(
            name="Test Kikuyu Branch",
            code="TEST-KIKUYU",
            town="Kikuyu",
            is_active=True,
        )

        self.other_branch = Branch.objects.create(
            name="Test Nairobi Branch",
            code="TEST-NAIROBI",
            town="Nairobi",
            is_active=True,
        )

        self.owner = self.create_user("test_owner", "OWNER")
        self.admin = self.create_user("test_admin", "ADMIN")
        self.accounts = self.create_user("test_accounts", "ACCOUNTS")
        self.supervisor = self.create_user(
            "test_supervisor", "SUPERVISOR"
        )
        self.cleaner = self.create_user("test_cleaner", "CLEANER")
        self.detailer = self.create_user("test_detailer", "DETAILER")

        self.create_staff_profile(
            self.accounts, "TEST-ACC-001", self.branch
        )
        self.create_staff_profile(
            self.supervisor, "TEST-SUP-001", self.branch
        )
        self.create_staff_profile(
            self.cleaner, "TEST-CLN-001", self.branch
        )
        self.create_staff_profile(
            self.detailer, "TEST-DET-001", self.branch
        )

        self.category = ExpenseCategory.objects.create(
            name="Utilities",
            description="Water and electricity",
            branch=None,
            created_by=self.owner,
        )

        self.branch_category = ExpenseCategory.objects.create(
            name="Cleaning Supplies",
            description="Cleaning materials",
            branch=self.branch,
            created_by=self.owner,
        )

        self.expense_url = "/api/expenses/records/"
        self.category_url = "/api/expenses/categories/"
        self.budget_url = "/api/expenses/budgets/"

    def create_user(self, username, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="TestPassword123!",
            role=role,
        )

    def create_staff_profile(self, user, staff_number, branch):
        return StaffProfile.objects.create(
            user=user,
            staff_number=staff_number,
            branch=branch,
            employment_status=StaffProfile.EmploymentStatus.ACTIVE,
            date_joined=date.today(),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def expense_payload(self, branch=None, category=None):
        return {
            "branch": (branch or self.branch).id,
            "category": (category or self.category).id,
            "expense_date": date.today().isoformat(),
            "description": "Monthly water bill",
            "amount": "2500.00",
            "payment_method": "MPESA",
            "receipt_number": "TEST-RECEIPT-001",
            "payment_reference": "TEST-MPESA-001",
            "notes": "Automated test expense",
        }

    def create_expense_through_api(self, user=None):
        user = user or self.accounts
        self.authenticate(user)

        response = self.client.post(
            self.expense_url,
            self.expense_payload(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            response.data,
        )

        return Expense.objects.get(pk=response.data["id"])


class ExpenseAccessTests(ExpenseAPITestBase):

    def test_owner_can_list_expenses(self):
        self.authenticate(self.owner)
        response = self.client.get(self.expense_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_can_list_expenses(self):
        self.authenticate(self.admin)
        response = self.client.get(self.expense_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_accounts_can_access_assigned_branch(self):
        self.authenticate(self.accounts)
        response = self.client.get(self.expense_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_supervisor_can_access_assigned_branch(self):
        self.authenticate(self.supervisor)
        response = self.client.get(self.expense_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cleaner_cannot_access_expenses(self):
        self.authenticate(self.cleaner)
        response = self.client.get(self.expense_url)
        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_detailer_cannot_access_expenses(self):
        self.authenticate(self.detailer)
        response = self.client.get(self.expense_url)
        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_accounts_cannot_record_expense_for_another_branch(self):
        self.authenticate(self.accounts)

        response = self.client.post(
            self.expense_url,
            self.expense_payload(branch=self.other_branch),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_accounts_only_see_their_own_branch_expenses(self):
        own_expense = Expense.objects.create(
            branch=self.branch,
            category=self.category,
            expense_date=date.today(),
            description="Own branch expense",
            amount=Decimal("1000.00"),
            payment_method="CASH",
            recorded_by=self.accounts,
        )

        other_expense = Expense.objects.create(
            branch=self.other_branch,
            category=self.category,
            expense_date=date.today(),
            description="Other branch expense",
            amount=Decimal("2000.00"),
            payment_method="CASH",
            recorded_by=self.owner,
        )

        self.authenticate(self.accounts)
        response = self.client.get(self.expense_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(own_expense.id, returned_ids)
        self.assertNotIn(other_expense.id, returned_ids)


class ExpenseWorkflowTests(ExpenseAPITestBase):

    def test_accounts_can_create_draft_expense(self):
        expense = self.create_expense_through_api()

        self.assertEqual(expense.status, Expense.Status.DRAFT)
        self.assertEqual(expense.recorded_by, self.accounts)
        self.assertEqual(expense.branch, self.branch)

    def test_accounts_can_submit_own_draft(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        response = self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {"comments": "Ready for approval"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        expense.refresh_from_db()

        self.assertEqual(expense.status, Expense.Status.PENDING)
        self.assertIsNotNone(expense.submitted_at)

        self.assertTrue(
            ExpenseApprovalHistory.objects.filter(
                expense=expense,
                action=ExpenseApprovalHistory.Action.SUBMITTED,
            ).exists()
        )

    def test_admin_can_approve_another_users_expense(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        submit_response = self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        self.assertEqual(
            submit_response.status_code,
            status.HTTP_200_OK,
        )

        self.authenticate(self.admin)

        response = self.client.post(
            f"{self.expense_url}{expense.id}/approve/",
            {"comments": "Verified and approved"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        expense.refresh_from_db()

        self.assertEqual(expense.status, Expense.Status.APPROVED)
        self.assertEqual(expense.approved_by, self.admin)
        self.assertIsNotNone(expense.approved_at)

        self.assertTrue(
            ExpenseApprovalHistory.objects.filter(
                expense=expense,
                action=ExpenseApprovalHistory.Action.APPROVED,
            ).exists()
        )

    def test_user_cannot_approve_own_expense(self):
        expense = self.create_expense_through_api(user=self.owner)
        self.authenticate(self.owner)

        submit_response = self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        self.assertEqual(
            submit_response.status_code,
            status.HTTP_200_OK,
        )

        response = self.client.post(
            f"{self.expense_url}{expense.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_accounts_cannot_approve_expenses(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        response = self.client.post(
            f"{self.expense_url}{expense.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_can_reject_with_reason(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        self.authenticate(self.admin)

        response = self.client.post(
            f"{self.expense_url}{expense.id}/reject/",
            {"reason": "Receipt is missing"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        expense.refresh_from_db()

        self.assertEqual(expense.status, Expense.Status.REJECTED)
        self.assertEqual(
            expense.rejection_reason,
            "Receipt is missing",
        )

    def test_rejection_requires_a_reason(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        self.authenticate(self.admin)

        response = self.client.post(
            f"{self.expense_url}{expense.id}/reject/",
            {"reason": ""},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_admin_can_void_approved_expense(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.accounts)

        self.client.post(
            f"{self.expense_url}{expense.id}/submit/",
            {},
            format="json",
        )

        self.authenticate(self.admin)

        self.client.post(
            f"{self.expense_url}{expense.id}/approve/",
            {},
            format="json",
        )

        response = self.client.post(
            f"{self.expense_url}{expense.id}/void/",
            {"reason": "Duplicate expense entry"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        expense.refresh_from_db()

        self.assertEqual(expense.status, Expense.Status.VOIDED)
        self.assertEqual(
            expense.void_reason,
            "Duplicate expense entry",
        )

    def test_expenses_cannot_be_deleted(self):
        expense = self.create_expense_through_api()
        self.authenticate(self.admin)

        response = self.client.delete(
            f"{self.expense_url}{expense.id}/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

        self.assertTrue(
            Expense.objects.filter(pk=expense.id).exists()
        )


class ExpenseCategoryTests(ExpenseAPITestBase):

    def test_owner_can_create_shared_category(self):
        self.authenticate(self.owner)

        response = self.client.post(
            self.category_url,
            {
                "name": "Transport",
                "description": "Business transport expenses",
                "branch": None,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            response.data,
        )

        self.assertIsNone(
            ExpenseCategory.objects.get(
                pk=response.data["id"]
            ).branch
        )

    def test_accounts_cannot_create_category(self):
        self.authenticate(self.accounts)

        response = self.client.post(
            self.category_url,
            {
                "name": "Transport",
                "description": "Transport costs",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_accounts_can_view_shared_and_branch_categories(self):
        self.authenticate(self.accounts)
        response = self.client.get(self.category_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = {
            item["id"] for item in response.data
        }

        self.assertIn(self.category.id, returned_ids)
        self.assertIn(self.branch_category.id, returned_ids)


class ExpenseBudgetTests(ExpenseAPITestBase):

    def create_budget(self):
        return ExpenseBudget.objects.create(
            branch=self.branch,
            category=self.category,
            name="Monthly Utilities Budget",
            period_start=date.today(),
            period_end=date.today(),
            budget_amount=Decimal("30000.00"),
            created_by=self.owner,
        )

    def test_owner_can_create_budget(self):
        self.authenticate(self.owner)

        response = self.client.post(
            self.budget_url,
            {
                "branch": self.branch.id,
                "category": self.category.id,
                "name": "Monthly Utilities Budget",
                "period_start": date.today().isoformat(),
                "period_end": date.today().isoformat(),
                "budget_amount": "30000.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            response.data,
        )

        budget = ExpenseBudget.objects.get(
            pk=response.data["id"]
        )

        self.assertEqual(
            budget.status,
            ExpenseBudget.Status.DRAFT,
        )

    def test_accounts_cannot_access_budgets(self):
        self.authenticate(self.accounts)
        response = self.client.get(self.budget_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_can_approve_another_users_budget(self):
        budget = self.create_budget()
        self.authenticate(self.owner)

        submit_response = self.client.post(
            f"{self.budget_url}{budget.id}/submit/",
            {},
            format="json",
        )

        self.assertEqual(
            submit_response.status_code,
            status.HTTP_200_OK,
        )

        self.authenticate(self.admin)

        response = self.client.post(
            f"{self.budget_url}{budget.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        budget.refresh_from_db()

        self.assertEqual(
            budget.status,
            ExpenseBudget.Status.APPROVED,
        )

        self.assertEqual(budget.approved_by, self.admin)

    def test_budget_creator_cannot_approve_own_budget(self):
        budget = self.create_budget()
        self.authenticate(self.owner)

        self.client.post(
            f"{self.budget_url}{budget.id}/submit/",
            {},
            format="json",
        )

        response = self.client.post(
            f"{self.budget_url}{budget.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
