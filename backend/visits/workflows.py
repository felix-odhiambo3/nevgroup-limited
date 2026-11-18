
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch
from services.models import (
    Service,
    BranchServicePrice,
    BranchServiceCategoryPrice,
)
from staff.models import StaffProfile
from vehicles.models import Vehicle
from vehicles.serializers import VehicleSerializer

from .models import Visit, ServiceAssignment
from .serializers import (
    VisitSerializer,
    VisitServiceSerializer,
    ServiceAssignmentSerializer,
)


class WorkflowStaffAssignmentSerializer(serializers.Serializer):
    staff_id = serializers.IntegerField(min_value=1)

    shift = serializers.ChoiceField(
        choices=ServiceAssignment.Shift.choices,
        required=True,
    )


class WorkflowServiceItemSerializer(serializers.Serializer):
    service_id = serializers.IntegerField(min_value=1)

    staff_assignments = WorkflowStaffAssignmentSerializer(
        many=True,
        required=False,
        default=list,
    )

    # Used only for SUPERVISOR_SET services.
    price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
    )

    zero_price_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
    )

    # Reject clients still using the old assignment format.
    staff_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        write_only=True,
    )

    def validate(self, attrs):
        if 'staff_ids' in attrs:
            raise serializers.ValidationError({
                'staff_ids': (
                    'The staff_ids format is no longer supported. '
                    'Use staff_assignments with an explicit DAY or NIGHT shift.'
                )
            })

        assignments = attrs.get('staff_assignments', [])
        staff_ids = [item['staff_id'] for item in assignments]

        if len(staff_ids) != len(set(staff_ids)):
            raise serializers.ValidationError({
                'staff_assignments': (
                    'The same employee cannot be selected more than once '
                    'for the same service.'
                )
            })

        return attrs


class VehicleIntakeWorkflowSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )

    vehicle = serializers.DictField(required=False)

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
    Create a vehicle visit, its services and employee assignments
    through one atomic request.

    Service prices are calculated from the servicing branch's active
    pricing configuration and snapshotted on each VisitService.

    Every new employee assignment must include an explicit DAY
    or NIGHT shift.
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

    def validate_service_pricing(
        self,
        request,
        service,
        branch_price,
        vehicle,
        item,
        servicing_branch,
    ):
        role = getattr(request.user, 'role', None)
        pricing_mode = service.pricing_mode

        if pricing_mode == Service.PricingMode.FIXED:
            if branch_price.price is None:
                raise ValidationError({
                    'services': (
                        f'{service.name} has no configured fixed price '
                        f'at {servicing_branch.name}.'
                    )
                })

            if (
                branch_price.price == 0
                and not str(branch_price.zero_price_reason).strip()
            ):
                raise ValidationError({
                    'services': (
                        f'{service.name} has a zero price but no reason '
                        f'or promotion is configured.'
                    )
                })

            if 'price' in item or item.get('zero_price_reason'):
                raise ValidationError({
                    'services': (
                        f'{service.name} uses a configured branch price. '
                        'A manual price cannot be submitted.'
                    )
                })

        elif pricing_mode == Service.PricingMode.VEHICLE_CATEGORY:
            if branch_price.price is not None:
                raise ValidationError({
                    'services': (
                        f'{service.name} has an invalid category-pricing '
                        'configuration. Its branch-level price must be blank.'
                    )
                })

            if not vehicle.category_id:
                raise ValidationError({
                    'services': (
                        f'{service.name} requires a vehicle category. '
                        'Select or update the vehicle category first.'
                    )
                })

            category_price = (
                BranchServiceCategoryPrice.objects
                .filter(
                    branch_service_price=branch_price,
                    vehicle_category_id=vehicle.category_id,
                    is_active=True,
                )
                .first()
            )

            if category_price is None:
                raise ValidationError({
                    'services': (
                        f'No active {service.name} price is configured '
                        f'for vehicle category {vehicle.category.name} '
                        f'at {servicing_branch.name}.'
                    )
                })

            if (
                category_price.price == 0
                and not str(category_price.zero_price_reason).strip()
            ):
                raise ValidationError({
                    'services': (
                        f'The zero price for {service.name} and '
                        f'{vehicle.category.name} has no reason or promotion.'
                    )
                })

            if 'price' in item or item.get('zero_price_reason'):
                raise ValidationError({
                    'services': (
                        f'{service.name} uses vehicle-category pricing. '
                        'A manual price cannot be submitted.'
                    )
                })

        elif pricing_mode == Service.PricingMode.SUPERVISOR_SET:
            if role != 'SUPERVISOR':
                raise PermissionDenied(
                    f'Only a SUPERVISOR can add {service.name} '
                    'and enter its agreed price.'
                )

            if branch_price.price is not None:
                raise ValidationError({
                    'services': (
                        f'{service.name} has an invalid supervisor-set '
                        'pricing configuration. Its branch-level price '
                        'must be blank.'
                    )
                })

            if 'price' not in item:
                raise ValidationError({
                    'services': (
                        f'Enter the agreed price for {service.name}.'
                    )
                })

            entered_price = item['price']
            reason = str(item.get('zero_price_reason', '')).strip()

            if entered_price == 0 and not reason:
                raise ValidationError({
                    'services': (
                        f'A reason or promotion is required for a '
                        f'zero-priced {service.name}.'
                    )
                })

        else:
            raise ValidationError({
                'services': (
                    f'{service.name} has an unsupported pricing method.'
                )
            })

    def prepare_services(
        self,
        request,
        data,
        servicing_branch,
        vehicle,
    ):
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

        for item in service_items:
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
                        'owner to configure the branch price.'
                    )
                })

            self.validate_service_pricing(
                request=request,
                service=service,
                branch_price=branch_price,
                vehicle=vehicle,
                item=item,
                servicing_branch=servicing_branch,
            )

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

            requested_assignments = item.get('staff_assignments', [])

            if requested_assignments and not can_assign:
                raise PermissionDenied(
                    'Only ADMIN and SUPERVISOR accounts can assign employees.'
                )

            if can_assign and not requested_assignments:
                raise ValidationError({
                    'services': (
                        f'Assign at least one eligible employee with an '
                        f'explicit shift to {service.name}.'
                    )
                })

            prepared_assignments = []

            if requested_assignments:
                requested_ids = [
                    assignment['staff_id']
                    for assignment in requested_assignments
                ]

                staff_members = (
                    StaffProfile.objects
                    .select_related('user', 'branch')
                    .filter(
                        pk__in=requested_ids,
                        branch=servicing_branch,
                        employment_status=StaffProfile.EmploymentStatus.ACTIVE,
                        is_archived=False,
                        user__is_active=True,
                    )
                )

                staff_by_id = {
                    staff.pk: staff
                    for staff in staff_members
                }

                if len(staff_by_id) != len(requested_ids):
                    raise ValidationError({
                        'services': (
                            f'One or more selected employees for '
                            f'{service.name} are unavailable or do not '
                            'belong to this branch.'
                        )
                    })

                for requested in requested_assignments:
                    staff = staff_by_id[requested['staff_id']]

                    if staff.user.role != expected_role:
                        raise ValidationError({
                            'services': (
                                f'{service.name} requires employees with '
                                f'the {expected_role} role. '
                                f'{staff.staff_number} has role '
                                f'{staff.user.role}.'
                            )
                        })

                    prepared_assignments.append({
                        'staff': staff,
                        'shift': requested['shift'],
                    })

            prepared.append({
                'service': service,
                'price': item.get('price'),
                'zero_price_reason': item.get('zero_price_reason', ''),
                'staff_assignments': prepared_assignments,
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

        # Saving the new vehicle inside this atomic transaction is safe:
        # any later validation failure rolls the vehicle creation back.
        if is_new_vehicle:
            vehicle = vehicle_serializer.save()

        prepared_services = self.prepare_services(
            request=request,
            data=data,
            servicing_branch=servicing_branch,
            vehicle=vehicle,
        )

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

            service_data = {
                'service': service.pk,
            }

            if item['price'] is not None:
                service_data['price'] = item['price']

            if item['zero_price_reason']:
                service_data['zero_price_reason'] = (
                    item['zero_price_reason']
                )

            visit_service_serializer = VisitServiceSerializer(
                data=service_data,
                context={
                    'request': request,
                    'visit': visit,
                },
            )
            visit_service_serializer.is_valid(raise_exception=True)

            visit_service = visit_service_serializer.save()

            assignments = []

            for staff_assignment in item['staff_assignments']:
                assignment = ServiceAssignment.objects.create(
                    visit_service=visit_service,
                    staff=staff_assignment['staff'],
                    shift=staff_assignment['shift'],
                    assigned_by=request.user,
                )
                assignments.append(assignment)

            service_results.append({
                'service': VisitServiceSerializer(
                    visit_service,
                    context={
                        'request': request,
                        'visit': visit,
                    },
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
