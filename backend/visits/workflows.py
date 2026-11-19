
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch
from services.models import Service, BranchServicePrice
from staff.models import StaffProfile
from vehicles.models import Vehicle
from vehicles.serializers import VehicleSerializer

from .models import Visit, VisitService, ServiceAssignment
from .serializers import (
    VisitSerializer,
    VisitServiceSerializer,
    ServiceAssignmentSerializer,
)


class WorkflowServiceItemSerializer(serializers.Serializer):
    service_id = serializers.IntegerField(min_value=1)

    staff_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
        allow_empty=True,
    )

    def validate_staff_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError(
                'The same employee cannot be selected more than once.'
            )
        return value


class VehicleIntakeWorkflowSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )

    vehicle = serializers.DictField(
        required=False,
    )

    branch_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )

    registration_branch_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )

    plastic_mat_count = serializers.IntegerField(
        min_value=0,
        required=False,
        default=0,
    )

    woolen_mat_count = serializers.IntegerField(
        min_value=0,
        required=False,
        default=0,
    )

    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
    )

    services = WorkflowServiceItemSerializer(
        many=True,
        required=False,
        default=list,
    )

    def validate(self, attrs):
        has_existing_vehicle = 'vehicle_id' in attrs
        has_new_vehicle = 'vehicle' in attrs

        if has_existing_vehicle == has_new_vehicle:
            raise serializers.ValidationError({
                'vehicle': (
                    'Provide either vehicle_id for an existing vehicle '
                    'or vehicle details for a new vehicle, but not both.'
                )
            })

        service_ids = [
            item['service_id']
            for item in attrs.get('services', [])
        ]

        if len(service_ids) != len(set(service_ids)):
            raise serializers.ValidationError({
                'services': (
                    'A service can only be selected once for this visit.'
                )
            })

        return attrs


class VehicleIntakeWorkflowView(APIView):
    """
    Create a vehicle visit, services and employee assignments
    through one atomic request.

    Service prices are retrieved from the servicing branch's
    active BranchServicePrice records and snapshotted on each
    VisitService.
    """

    permission_classes = [IsAuthenticated]

    VISIT_ROLES = {
        'ADMIN',
        'OWNER',
        'SUPERVISOR',
        'DETAILER',
    }

    VEHICLE_REGISTRATION_ROLES = {
        'ADMIN',
        'SUPERVISOR',
        'DETAILER',
    }

    SERVICE_ROLES = {
        'ADMIN',
        'SUPERVISOR',
        'DETAILER',
    }

    ASSIGNMENT_ROLES = {
        'ADMIN',
        'SUPERVISOR',
    }

    def get_active_staff_profile(self, user):
        profile = (
            StaffProfile.objects
            .select_related('branch', 'user')
            .filter(
                user=user,
                is_archived=False,
                employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                user__is_active=True,
            )
            .first()
        )

        if profile is None:
            raise PermissionDenied(
                'An active staff profile is required for this operation.'
            )

        if not profile.branch.is_active:
            raise PermissionDenied(
                'Your assigned branch is inactive.'
            )

        return profile

    def resolve_servicing_branch(self, request, data):
        user = request.user
        role = getattr(user, 'role', None)

        if role in {'ADMIN', 'OWNER'}:
            branch_id = data.get('branch_id')

            if not branch_id:
                raise ValidationError({
                    'branch_id': (
                        'Select the branch where the vehicle will be serviced.'
                    )
                })

            branch = Branch.objects.filter(
                pk=branch_id,
                is_active=True,
            ).first()

            if branch is None:
                raise ValidationError({
                    'branch_id': 'The selected servicing branch is unavailable.'
                })

            return branch, None

        profile = self.get_active_staff_profile(user)

        submitted_branch_id = data.get('branch_id')

        if (
            submitted_branch_id
            and submitted_branch_id != profile.branch_id
        ):
            raise PermissionDenied(
                'You can only create visits at your assigned branch.'
            )

        return profile.branch, profile

    def resolve_registration_branch(
        self,
        request,
        data,
        servicing_branch,
        staff_profile,
    ):
        role = getattr(request.user, 'role', None)

        if role not in self.VEHICLE_REGISTRATION_ROLES:
            raise PermissionDenied(
                'Your account cannot register new vehicles.'
            )

        registration_branch_id = (
            data.get('registration_branch_id')
            or servicing_branch.pk
        )

        registration_branch = Branch.objects.filter(
            pk=registration_branch_id,
            is_active=True,
        ).first()

        if registration_branch is None:
            raise ValidationError({
                'registration_branch_id': (
                    'The selected vehicle registration branch is unavailable.'
                )
            })

        if (
            staff_profile is not None
            and registration_branch.pk != staff_profile.branch_id
        ):
            raise PermissionDenied(
                'You can only register vehicles at your assigned branch.'
            )

        return registration_branch

    def prepare_vehicle(
        self,
        request,
        data,
        servicing_branch,
        staff_profile,
    ):
        if 'vehicle_id' in data:
            vehicle = (
                Vehicle.objects
                .select_related('branch', 'category', 'customer')
                .filter(pk=data['vehicle_id'])
                .first()
            )

            if vehicle is None:
                raise ValidationError({
                    'vehicle_id': 'The selected vehicle does not exist.'
                })

            if not vehicle.is_active:
                raise ValidationError({
                    'vehicle_id': (
                        'This vehicle is inactive and cannot be checked in.'
                    )
                })

            return vehicle, None, False

        registration_branch = self.resolve_registration_branch(
            request=request,
            data=data,
            servicing_branch=servicing_branch,
            staff_profile=staff_profile,
        )

        vehicle_data = dict(data['vehicle'])
        vehicle_data['branch'] = registration_branch.pk

        vehicle_serializer = VehicleSerializer(
            data=vehicle_data,
            context={'request': request},
        )

        vehicle_serializer.is_valid(raise_exception=True)

        return None, vehicle_serializer, True

    def prepare_services(self, request, data, servicing_branch):
        role = getattr(request.user, 'role', None)
        service_items = data.get('services', [])

        if not service_items:
            if role in self.SERVICE_ROLES:
                raise ValidationError({
                    'services': (
                        'Add at least one service before submitting this visit.'
                    )
                })

            return []

        if role not in self.SERVICE_ROLES:
            raise PermissionDenied(
                'Your account cannot add services to vehicle visits.'
            )

        prepared = []
        can_assign = role in self.ASSIGNMENT_ROLES

        for index, item in enumerate(service_items):
            service = (
                Service.objects
                .filter(
                    pk=item['service_id'],
                    is_active=True,
                )
                .first()
            )

            if service is None:
                raise ValidationError({
                    'services': (
                        f'Service #{item["service_id"]} is unavailable.'
                    )
                })

            # Every service must have an active price for the
            # branch where this visit is being serviced.
            branch_price = (
                BranchServicePrice.objects
                .filter(
                    branch=servicing_branch,
                    service=service,
                    is_active=True,
                )
                .first()
            )

            if branch_price is None:
                raise ValidationError({
                    'services': (
                        f'{service.name} has no active price configured '
                        f'for {servicing_branch.name}. Ask an admin or '
                        f'owner to configure the branch price.'
                    )
                })

            if service.category == Service.Category.CAR_WASH:
                expected_role = 'CLEANER'
            elif service.category == Service.Category.DETAILING:
                expected_role = 'DETAILER'
            else:
                raise ValidationError({
                    'services': (
                        f'{service.name} has an unsupported service category.'
                    )
                })

            staff_ids = item.get('staff_ids', [])

            if staff_ids and not can_assign:
                raise PermissionDenied(
                    'Only ADMIN and SUPERVISOR accounts can assign employees.'
                )

            if can_assign and not staff_ids:
                raise ValidationError({
                    'services': (
                        f'Assign at least one eligible employee to '
                        f'{service.name}.'
                    )
                })

            staff_members = []

            if staff_ids:
                staff_members = list(
                    StaffProfile.objects
                    .select_related('user', 'branch')
                    .filter(
                        pk__in=staff_ids,
                        branch=servicing_branch,
                        employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                        is_archived=False,
                        user__is_active=True,
                    )
                )

                if len(staff_members) != len(staff_ids):
                    raise ValidationError({
                        'services': (
                            f'One or more selected employees for '
                            f'{service.name} are unavailable or do not '
                            f'belong to this branch.'
                        )
                    })

                for staff in staff_members:
                    if staff.user.role != expected_role:
                        raise ValidationError({
                            'services': (
                                f'{service.name} requires employees with '
                                f'the {expected_role} role. '
                                f'{staff.staff_number} has role '
                                f'{staff.user.role}.'
                            )
                        })

            prepared.append({
                'service': service,
                'branch_price': branch_price,
                'staff': staff_members,
            })

        return prepared

    @transaction.atomic
    def post(self, request):
        role = getattr(request.user, 'role', None)

        if role not in self.VISIT_ROLES:
            raise PermissionDenied(
                'Your account cannot create vehicle visits.'
            )

        input_serializer = VehicleIntakeWorkflowSerializer(
            data=request.data
        )
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        servicing_branch, staff_profile = (
            self.resolve_servicing_branch(request, data)
        )

        vehicle, vehicle_serializer, is_new_vehicle = (
            self.prepare_vehicle(
                request=request,
                data=data,
                servicing_branch=servicing_branch,
                staff_profile=staff_profile,
            )
        )

        prepared_services = self.prepare_services(
            request=request,
            data=data,
            servicing_branch=servicing_branch,
        )

        # All permissions and input validation have passed.
        # Create the vehicle, visit, services and assignments
        # together within this database transaction.

        if is_new_vehicle:
            vehicle = vehicle_serializer.save()

        visit = Visit.objects.create(
            vehicle=vehicle,
            branch=servicing_branch,
            checked_in_by=request.user,
            plastic_mat_count=data.get('plastic_mat_count', 0),
            woolen_mat_count=data.get('woolen_mat_count', 0),
            comment=data.get('comment', '').strip(),
        )

        service_results = []

        for item in prepared_services:
            service = item['service']
            branch_price = item['branch_price']

            visit_service = VisitService.objects.create(
                visit=visit,
                service=service,
                service_name=service.name,
                service_code=service.code,
                service_category=service.category,
                original_price=branch_price.price,
                duration_minutes=service.duration_minutes,
                requires_timer=service.requires_timer,
                added_by=request.user,
            )

            assignments = []

            for staff in item['staff']:
                assignment = ServiceAssignment.objects.create(
                    visit_service=visit_service,
                    staff=staff,
                    assigned_by=request.user,
                )
                assignments.append(assignment)

            service_results.append({
                'service': VisitServiceSerializer(
                    visit_service,
                    context={'request': request, 'visit': visit},
                ).data,
                'assignments': ServiceAssignmentSerializer(
                    assignments,
                    many=True,
                    context={'request': request},
                ).data,
            })

        return Response(
            {
                'detail': (
                    'Vehicle intake, visit, services and assignments '
                    'were saved successfully.'
                ),
                'vehicle_created': is_new_vehicle,
                'vehicle_id': vehicle.pk,
                'visit': VisitSerializer(
                    visit,
                    context={'request': request},
                ).data,
                'services': service_results,
            },
            status=status.HTTP_201_CREATED,
        )
