
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch

from .models import Visit, VisitService, ServiceAssignment
from .monitoring import (
    get_monitoring_access,
    get_shift_filter,
    apply_shift_filter,
    MonitorAssignmentSerializer,
)


def get_operational_window(work_date):
    """
    Operational day: 7:00 AM on work_date to 7:00 AM
    on the following calendar day, using the active Django timezone.
    """
    current_tz = timezone.get_current_timezone()

    start = timezone.make_aware(
        datetime.combine(work_date, time(7, 0)),
        current_tz,
    )

    end = start + timedelta(days=1)

    return start, end


def get_default_operational_date():
    local_now = timezone.localtime()
    current_date = local_now.date()

    if local_now.time().replace(tzinfo=None) < time(7, 0):
        return current_date - timedelta(days=1)

    return current_date


def get_report_date(request):
    raw_date = request.query_params.get("work_date")

    if not raw_date:
        return get_default_operational_date()

    work_date = parse_date(raw_date)

    if work_date is None:
        raise ValidationError({
            "work_date": "Use the YYYY-MM-DD date format."
        })

    return work_date


def get_accessible_branches(request, access):
    """
    Supervisors and admins are restricted to their assigned branch.
    Owners and superusers can view all active branches or select one.
    """
    branches = Branch.objects.filter(is_active=True).order_by("name")

    requested_branch = request.query_params.get("branch")

    if access["role"] in {"SUPERVISOR", "ADMIN"}:
        branch_id = access["branch_id"]

        if requested_branch and str(branch_id) != requested_branch:
            raise PermissionDenied(
                "You cannot access another branch's workload."
            )

        return branches.filter(pk=branch_id)

    if requested_branch:
        try:
            branch_id = int(requested_branch)
        except (TypeError, ValueError):
            raise ValidationError({
                "branch": "Provide a valid branch ID."
            })

        branches = branches.filter(pk=branch_id)

        if not branches.exists():
            raise ValidationError({
                "branch": "The selected active branch was not found."
            })

    return branches


class BranchWideMonitorAssignmentsView(APIView):
    """
    Read-only branch-wide assignment monitoring.

    Supervisors see every assignment in their branch.
    Admins see every assignment in their branch.
    Owners and superusers see all branches.

    This endpoint does not grant additional modification permissions.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        access = get_monitoring_access(request.user)

        branch_ids = list(
            get_accessible_branches(request, access)
            .values_list("id", flat=True)
        )

        queryset = (
            ServiceAssignment.objects
            .select_related(
                "staff",
                "staff__user",
                "assigned_by",
                "completed_by",
                "removed_by",
                "visit_service",
                "visit_service__visit",
                "visit_service__visit__vehicle",
                "visit_service__visit__branch",
                "visit_service__service",
            )
            .filter(
                visit_service__visit__branch_id__in=branch_ids
            )
        )

        assignment_filter = request.query_params.get(
            "status",
            "ALL",
        ).upper()

        if assignment_filter == "ACTIVE":
            queryset = queryset.filter(
                is_active=True,
                completed_at__isnull=True,
            )
        elif assignment_filter == "COMPLETED":
            queryset = queryset.filter(
                completed_at__isnull=False,
            )
        elif assignment_filter == "REMOVED":
            queryset = queryset.filter(is_active=False)
        elif assignment_filter != "ALL":
            raise ValidationError({
                "status": (
                    "Choose ALL, ACTIVE, COMPLETED or REMOVED."
                )
            })

        shift_filter = get_shift_filter(request)
        queryset = apply_shift_filter(queryset, shift_filter)

        search = request.query_params.get("search", "").strip()

        if search:
            queryset = queryset.filter(
                Q(
                    visit_service__visit__vehicle__registration_number__icontains=search
                )
                | Q(
                    visit_service__visit__vehicle__make_model__icontains=search
                )
                | Q(
                    visit_service__service_name__icontains=search
                )
                | Q(staff__staff_number__icontains=search)
                | Q(staff__user__first_name__icontains=search)
                | Q(staff__user__last_name__icontains=search)
            )

        queryset = queryset.order_by("-assigned_at", "-pk")

        return Response({
            "role": access["role"],
            "branch_id": access["branch_id"],
            "branch_name": access["branch_name"],
            "status_filter": assignment_filter,
            "shift_filter": shift_filter,
            "count": queryset.count(),
            "assignments": MonitorAssignmentSerializer(
                queryset,
                many=True,
            ).data,
        })


class WorkloadReportView(APIView):
    """
    Read-only operational workload report for one operational date.

    Shift filtering affects assignment metrics and employee workload.
    It deliberately does not affect visit totals, service totals, or
    the determination of assigned and unassigned services.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        access = get_monitoring_access(request.user)
        work_date = get_report_date(request)
        start, end = get_operational_window(work_date)
        shift_filter = get_shift_filter(request)

        branches = get_accessible_branches(request, access)

        branch_reports = []

        for branch in branches:
            visits = (
                Visit.objects
                .filter(
                    branch=branch,
                    arrival_time__gte=start,
                    arrival_time__lt=end,
                )
                .select_related("vehicle", "branch")
                .order_by("arrival_time", "id")
            )

            visit_ids = list(visits.values_list("id", flat=True))

            services = list(
                VisitService.objects
                .filter(
                    visit_id__in=visit_ids,
                    is_removed=False,
                )
                .select_related("visit", "service")
                .order_by("added_at", "id")
            )

            service_ids = [service.id for service in services]

            # Keep every assignment here. This unfiltered set is needed
            # to calculate whether each service has any active employee.
            all_assignments = list(
                ServiceAssignment.objects
                .filter(visit_service_id__in=service_ids)
                .select_related(
                    "staff",
                    "staff__user",
                    "assigned_by",
                    "completed_by",
                    "removed_by",
                    "visit_service",
                    "visit_service__visit",
                    "visit_service__visit__vehicle",
                    "visit_service__visit__branch",
                    "visit_service__service",
                )
                .order_by("assigned_at", "id")
            )

            # Apply the selected shift only to assignment-level reporting.
            report_assignments = [
                assignment
                for assignment in all_assignments
                if (
                    shift_filter == "ALL"
                    or (
                        shift_filter == "NOT_RECORDED"
                        and assignment.shift is None
                    )
                    or assignment.shift == shift_filter
                )
            ]

            # Service allocation remains based on all shifts.
            all_active_assignments = [
                assignment
                for assignment in all_assignments
                if assignment.is_active
            ]

            active_assignment_counts = {}

            for assignment in all_active_assignments:
                service_id = assignment.visit_service_id
                active_assignment_counts[service_id] = (
                    active_assignment_counts.get(service_id, 0) + 1
                )

            unassigned_services = [
                service for service in services
                if active_assignment_counts.get(service.id, 0) == 0
            ]

            # These counts and employee totals are shift-filtered.
            active_assignments = [
                assignment for assignment in report_assignments
                if assignment.is_active
            ]

            pending_assignments = [
                assignment for assignment in active_assignments
                if assignment.completed_at is None
            ]

            completed_assignments = [
                assignment for assignment in active_assignments
                if assignment.completed_at is not None
            ]

            removed_assignments = [
                assignment for assignment in report_assignments
                if not assignment.is_active
            ]

            staff_totals = {}

            for assignment in active_assignments:
                staff = assignment.staff
                staff_id = staff.id

                if staff_id not in staff_totals:
                    user = staff.user
                    staff_totals[staff_id] = {
                        "staff_id": staff_id,
                        "staff_number": staff.staff_number,
                        "staff_name": (
                            user.get_full_name() or user.username
                        ),
                        "assigned": 0,
                        "pending": 0,
                        "completed": 0,
                    }

                totals = staff_totals[staff_id]
                totals["assigned"] += 1

                if assignment.completed_at is None:
                    totals["pending"] += 1
                else:
                    totals["completed"] += 1

            active_visits = [
                visit for visit in visits
                if visit.status in {
                    Visit.Status.CHECKED_IN,
                    Visit.Status.IN_PROGRESS,
                }
            ]

            visit_rows = [
                {
                    "visit_id": visit.id,
                    "vehicle_registration": (
                        visit.vehicle.registration_number
                    ),
                    "vehicle_make_model": visit.vehicle.make_model,
                    "visit_status": visit.status,
                    "arrival_time": visit.arrival_time,
                    "service_count": sum(
                        1 for service in services
                        if service.visit_id == visit.id
                    ),
                }
                for visit in visits
            ]

            service_rows = [
                {
                    "visit_service_id": service.id,
                    "visit_id": service.visit_id,
                    "vehicle_registration": (
                        service.visit.vehicle.registration_number
                    ),
                    "service_name": service.service_name,
                    "service_code": service.service_code,
                    "service_category": service.service_category,
                    "service_price": service.original_price,
                    "assigned_employee_count": (
                        active_assignment_counts.get(service.id, 0)
                    ),
                    "is_unassigned": (
                        active_assignment_counts.get(service.id, 0) == 0
                    ),
                }
                for service in services
            ]

            branch_reports.append({
                "branch_id": branch.id,
                "branch_name": branch.name,
                "shift_filter": shift_filter,
                "summary": {
                    "total_visits": len(visit_ids),
                    "active_visits": len(active_visits),
                    "total_services": len(services),
                    "assigned_services": sum(
                        1 for service in services
                        if active_assignment_counts.get(service.id, 0) > 0
                    ),
                    "unassigned_services": len(unassigned_services),
                    "active_assignments": len(active_assignments),
                    "pending_assignments": len(pending_assignments),
                    "completed_assignments": len(completed_assignments),
                    "removed_assignments": len(removed_assignments),
                },
                "visits": visit_rows,
                "services": service_rows,
                "unassigned_services": [
                    {
                        "visit_service_id": service.id,
                        "visit_id": service.visit_id,
                        "vehicle_registration": (
                            service.visit.vehicle.registration_number
                        ),
                        "service_name": service.service_name,
                        "service_category": service.service_category,
                    }
                    for service in unassigned_services
                ],
                "employee_workload": sorted(
                    staff_totals.values(),
                    key=lambda item: item["staff_name"].lower(),
                ),
                "assignments": MonitorAssignmentSerializer(
                    report_assignments,
                    many=True,
                ).data,
            })

        overall = {
            "total_visits": 0,
            "active_visits": 0,
            "total_services": 0,
            "assigned_services": 0,
            "unassigned_services": 0,
            "active_assignments": 0,
            "pending_assignments": 0,
            "completed_assignments": 0,
            "removed_assignments": 0,
        }

        for report in branch_reports:
            for key in overall:
                overall[key] += report["summary"][key]

        return Response({
            "role": access["role"],
            "work_date": work_date.isoformat(),
            "operational_start": start,
            "operational_end": end,
            "shift_filter": shift_filter,
            "summary": overall,
            "branches": branch_reports,
        }, status=status.HTTP_200_OK)


class VisitCompletionReadinessView(APIView):
    """
    Lists active visits and determines whether each can be completed.

    OWNER: all active branches.
    ADMIN/SUPERVISOR: their assigned branch only.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        access = get_monitoring_access(request.user)

        branches = get_accessible_branches(request, access)
        branch_ids = list(
            branches.values_list("id", flat=True)
        )

        visits = list(
            Visit.objects
            .filter(
                branch_id__in=branch_ids,
                status__in=[
                    Visit.Status.CHECKED_IN,
                    Visit.Status.IN_PROGRESS,
                ],
            )
            .select_related("vehicle", "branch")
            .order_by("-arrival_time", "-id")
        )

        visit_ids = [visit.id for visit in visits]

        services = list(
            VisitService.objects
            .filter(
                visit_id__in=visit_ids,
                is_removed=False,
            )
            .order_by("id")
        )

        service_ids = [service.id for service in services]

        assignments = list(
            ServiceAssignment.objects
            .filter(
                visit_service_id__in=service_ids,
                is_active=True,
            )
            .order_by("id")
        )

        services_by_visit = {}
        active_assignment_counts = {}
        pending_assignment_counts = {}

        for service in services:
            services_by_visit.setdefault(
                service.visit_id, []
            ).append(service)

        for assignment in assignments:
            service_id = assignment.visit_service_id

            active_assignment_counts[service_id] = (
                active_assignment_counts.get(service_id, 0) + 1
            )

            if (
                assignment.completed_at is None
                or assignment.completed_by_id is None
            ):
                pending_assignment_counts[service_id] = (
                    pending_assignment_counts.get(service_id, 0) + 1
                )

        results = []

        for visit in visits:
            visit_services = services_by_visit.get(
                visit.id, []
            )

            unassigned_services = [
                service
                for service in visit_services
                if active_assignment_counts.get(service.id, 0) == 0
            ]

            pending_assignments = sum(
                pending_assignment_counts.get(service.id, 0)
                for service in visit_services
            )

            service_count = len(visit_services)
            unassigned_count = len(unassigned_services)

            can_finalize = (
                service_count > 0
                and unassigned_count == 0
                and pending_assignments == 0
            )

            blockers = []

            if service_count == 0:
                blockers.append("No active services have been added.")

            if unassigned_count:
                blockers.append(
                    f"{unassigned_count} service(s) have no active staff assignment."
                )

            if pending_assignments:
                blockers.append(
                    f"{pending_assignments} active assignment(s) are not completed."
                )

            results.append({
                "visit_id": visit.id,
                "branch_id": visit.branch_id,
                "branch_name": visit.branch.name,
                "vehicle_registration": (
                    visit.vehicle.registration_number
                ),
                "vehicle_make_model": visit.vehicle.make_model,
                "visit_status": visit.status,
                "arrival_time": visit.arrival_time,
                "service_count": service_count,
                "unassigned_service_count": unassigned_count,
                "active_assignment_count": sum(
                    active_assignment_counts.get(service.id, 0)
                    for service in visit_services
                ),
                "pending_assignment_count": pending_assignments,
                "can_finalize": can_finalize,
                "blockers": blockers,
            })

        return Response({
            "role": access["role"],
            "count": len(results),
            "ready_count": sum(
                1 for item in results if item["can_finalize"]
            ),
            "visits": results,
        }, status=status.HTTP_200_OK)
