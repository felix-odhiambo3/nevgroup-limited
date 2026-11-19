from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ProductionUserDiagnosticView,
    ProductionOwnerBootstrapView,
    CustomTokenObtainPairView,
    LogoutView,
    MeView,
    OwnerTestView,
    UserListCreateView,
    UserDetailView,
    UserDeactivateView,
    UserRoleHistoryView,
    UserPasswordResetView,
)

urlpatterns = [
    path("login/", CustomTokenObtainPairView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("owner-test/", OwnerTestView.as_view(), name="owner_test"),

    path(
        "diagnostics/user/",
        ProductionUserDiagnosticView.as_view(),
        name="production_user_diagnostic",
    ),
    path(
        "diagnostics/bootstrap-owner/",
        ProductionOwnerBootstrapView.as_view(),
        name="production_owner_bootstrap",
    ),

    path("users/", UserListCreateView.as_view(), name="user_list_create"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user_detail"),
    path(
        "users/<int:pk>/deactivate/",
        UserDeactivateView.as_view(),
        name="user_deactivate",
    ),
    path(
        "users/<int:pk>/role-history/",
        UserRoleHistoryView.as_view(),
        name="user_role_history",
    ),
    path(
        "users/<int:pk>/reset-password/",
        UserPasswordResetView.as_view(),
        name="user_password_reset",
    ),
]