
from rest_framework.routers import DefaultRouter

from .views import (
    ExpenseBudgetViewSet,
    ExpenseCategoryViewSet,
    ExpenseViewSet,
)


router = DefaultRouter()

router.register(
    "categories",
    ExpenseCategoryViewSet,
    basename="expense-category",
)

router.register(
    "records",
    ExpenseViewSet,
    basename="expense",
)

router.register(
    "budgets",
    ExpenseBudgetViewSet,
    basename="expense-budget",
)


urlpatterns = router.urls
