
from django.urls import path

from .views import (
    VisitListCreateView,
    VisitDetailView,
    VisitServiceListCreateView,
    ServiceAssignmentListCreateView,
    ServiceAssignmentRemoveView,
    MyDayView,
    ServiceAssignmentCompleteView,
    VisitCompleteView,
)

from .workflows import VehicleIntakeWorkflowView

from .monitoring import (
    SupervisorReassignView,
    SupervisorCompleteAssignmentView,
    SupervisorRemoveAssignmentView,
    AdminOwnerAssignmentCorrectionView,
)

from .workload_monitoring import (
    BranchWideMonitorAssignmentsView,
    WorkloadReportView,
)


urlpatterns = [
    path(
        "",
        VisitListCreateView.as_view(),
        name="visit_list_create",
    ),

    path(
        "register-and-assign/",
        VehicleIntakeWorkflowView.as_view(),
        name="vehicle_intake_workflow",
    ),

    path(
        "monitor-assignments/",
        BranchWideMonitorAssignmentsView.as_view(),
        name="supervisor_monitor_assignments",
    ),

    path(
        "monitor-workload/",
        WorkloadReportView.as_view(),
        name="visit_workload_report",
    ),

    path(
        "monitor-assignments/<int:assignment_id>/reassign/",
        SupervisorReassignView.as_view(),
        name="supervisor_reassign_assignment",
    ),

    path(
        "monitor-assignments/<int:assignment_id>/complete/",
        SupervisorCompleteAssignmentView.as_view(),
        name="supervisor_complete_assignment",
    ),

    path(
        "monitor-assignments/<int:assignment_id>/remove/",
        SupervisorRemoveAssignmentView.as_view(),
        name="supervisor_remove_assignment",
    ),

    path(
        "my-day/",
        MyDayView.as_view(),
        name="my_day",
    ),

    path(
        "assignments/<int:assignment_id>/complete/",
        ServiceAssignmentCompleteView.as_view(),
        name="complete_service_assignment",
    ),

    path(
        "assignments/<int:assignment_id>/corrections/",
        AdminOwnerAssignmentCorrectionView.as_view(),
        name="admin_owner_assignment_corrections",
    ),

    path(
        "<int:pk>/",
        VisitDetailView.as_view(),
        name="visit_detail",
    ),

    path(
        "<int:visit_id>/services/",
        VisitServiceListCreateView.as_view(),
        name="visit_services",
    ),

    path(
        "<int:visit_id>/services/<int:visit_service_id>/assignments/",
        ServiceAssignmentListCreateView.as_view(),
        name="service_assignments",
    ),

    path(
        "<int:visit_id>/services/<int:visit_service_id>/assignments/<int:assignment_id>/remove/",
        ServiceAssignmentRemoveView.as_view(),
        name="remove_service_assignment",
    ),

    path(
        "<int:visit_id>/complete/",
        VisitCompleteView.as_view(),
        name="complete_visit",
    ),
]
