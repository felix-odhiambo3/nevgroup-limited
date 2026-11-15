
from django.urls import path

from .views import (
    AttendanceOverrideListCreateView,
    AttendanceOverrideDetailView,
    AttendanceOverrideReviewView,
    AttendanceOverrideExecuteView,
    AttendanceOverrideAuditView,
    ShiftInstanceListView,
    MyAttendanceView,
    EmployeeClockInView,
    EmployeeClockOutView,
)


urlpatterns = [
    path(
        'me/',
        MyAttendanceView.as_view(),
        name='my_attendance',
    ),

    path(
        'clock-in/',
        EmployeeClockInView.as_view(),
        name='employee_clock_in',
    ),

    path(
        'clock-out/',
        EmployeeClockOutView.as_view(),
        name='employee_clock_out',
    ),

    path(
        'shifts/',
        ShiftInstanceListView.as_view(),
        name='attendance_shift_list',
    ),

    path(
        'overrides/',
        AttendanceOverrideListCreateView.as_view(),
        name='attendance_override_list_create',
    ),

    path(
        'overrides/<int:pk>/',
        AttendanceOverrideDetailView.as_view(),
        name='attendance_override_detail',
    ),

    path(
        'overrides/<int:pk>/review/',
        AttendanceOverrideReviewView.as_view(),
        name='attendance_override_review',
    ),

    path(
        'overrides/<int:pk>/execute/',
        AttendanceOverrideExecuteView.as_view(),
        name='attendance_override_execute',
    ),

    path(
        'overrides/<int:pk>/audit/',
        AttendanceOverrideAuditView.as_view(),
        name='attendance_override_audit',
    ),
]
