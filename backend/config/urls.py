
from django.contrib import admin
from django.urls import path, include
from django.contrib.staticfiles.urls import staticfiles_urlpatterns


urlpatterns = [
    path("admin/", admin.site.urls),

    # Authentication
    path("api/auth/", include("accounts.urls")),

    # Core business operations
    path("api/branches/", include("branches.urls")),
    path("api/staff/", include("staff.urls")),
    path("api/services/", include("services.urls")),
    path("api/vehicles/", include("vehicles.urls")),
    path("api/visits/", include("visits.urls")),

    # Attendance and payments
    path("api/attendance/", include("attendance.urls")),
    path("api/payments/", include("payments.urls")),

    # Expense management
    path("api/expenses/", include("expenses.urls")),
]

urlpatterns += staticfiles_urlpatterns()
