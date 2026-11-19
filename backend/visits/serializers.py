
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from branches.models import Branch
from services.models import BranchServicePrice
from staff.models import StaffProfile
from vehicles.models import Vehicle

from .models import Visit, VisitService, ServiceAssignment


class VisitSerializer(serializers.ModelSerializer):
    vehicle_registration = serializers.CharField(
        source='vehicle.registration_number',
        read_only=True
    )

    vehicle_make_model = serializers.CharField(
        source='vehicle.make_model',
        read_only=True
    )

    vehicle_category = serializers.CharField(
        source='vehicle.category.name',
        read_only=True
    )

    checked_in_by_name = serializers.CharField(
        source='checked_in_by.get_full_name',
        read_only=True
    )

    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True),
        required=False
    )

    branch_name = serializers.CharField(
        source='branch.name',
        read_only=True
    )

    plastic_mat_count = serializers.IntegerField(
        min_value=0,
        required=False,
        default=0
    )

    woolen_mat_count = serializers.IntegerField(
        min_value=0,
        required=False,
        default=0
    )

    class Meta:
        model = Visit
        fields = [
            'id',
            'vehicle',
            'vehicle_registration',
            'vehicle_make_model',
            'vehicle_category',
            'branch',
            'branch_name',
            'checked_in_by',
            'checked_in_by_name',
            'status',
            'arrival_time',
            'completed_at',
            'plastic_mat_count',
            'woolen_mat_count',
            'comment',
            'created_at',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'checked_in_by',
            'status',
            'arrival_time',
            'completed_at',
            'created_at',
            'updated_at',
        ]

    def validate_vehicle(self, vehicle):
        if not vehicle.is_active:
            raise serializers.ValidationError(
                "This vehicle is inactive and cannot be checked in."
            )

        return vehicle

    def validate(self, attrs):
        request = self.context['request']
        user = request.user

        selected_branch = attrs.get('branch')

        if user.is_superuser or user.role in ['ADMIN', 'OWNER']:
            if selected_branch is None:
                raise serializers.ValidationError({
                    'branch': (
                        'Select the branch where the vehicle '
                        'will actually be serviced.'
                    )
                })

            return attrs

        if not hasattr(user, 'staff_profile'):
            raise PermissionDenied(
                "Your account is not assigned to a branch."
            )

        assigned_branch = user.staff_profile.branch

        if not assigned_branch.is_active:
            raise PermissionDenied(
                "Your assigned branch is inactive."
            )

        if (
            selected_branch is not None
            and selected_branch.pk != assigned_branch.pk
        ):
            raise PermissionDenied(
                "You can only create visits at your assigned branch."
            )

        attrs['branch'] = assigned_branch

        return attrs

    def create(self, validated_data):
        request = self.context['request']
        validated_data['checked_in_by'] = request.user

        return super().create(validated_data)



class VisitServiceSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(read_only=True)
    service_code = serializers.CharField(read_only=True)

    original_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True
    )

    zero_price_reason = serializers.CharField(read_only=True)

    added_by_name = serializers.CharField(
        source='added_by.get_full_name',
        read_only=True
    )

    class Meta:
        model = VisitService
        fields = [
            'id',
            'visit',
            'service',
            'service_name',
            'service_code',
            'service_category',
            'original_price',
            'zero_price_reason',
            'duration_minutes',
            'requires_timer',
            'added_by',
            'added_by_name',
            'added_at',
            'is_removed',
        ]

        read_only_fields = [
            'id',
            'visit',
            'service_name',
            'service_code',
            'service_category',
            'original_price',
            'zero_price_reason',
            'duration_minutes',
            'requires_timer',
            'added_by',
            'added_at',
            'is_removed',
        ]

    def validate_service(self, service):
        if not service.is_active:
            raise serializers.ValidationError(
                "This service is currently inactive."
            )

        visit = self.context.get('visit')

        if visit is None:
            raise serializers.ValidationError(
                "The visit context is required."
            )

        branch_price_exists = BranchServicePrice.objects.filter(
            branch=visit.branch,
            service=service,
            is_active=True,
        ).exists()

        if not branch_price_exists:
            raise serializers.ValidationError(
                f"{service.name} has no active price configured "
                f"for {visit.branch.name}. Ask an admin or owner "
                f"to configure the branch price."
            )

        return service

    @transaction.atomic
    def create(self, validated_data):
        service = validated_data['service']
        request = self.context['request']
        visit = self.context['visit']

        branch_price = (
            BranchServicePrice.objects
            .select_for_update()
            .filter(
                branch=visit.branch,
                service=service,
                is_active=True,
            )
            .first()
        )

        if branch_price is None:
            raise serializers.ValidationError({
                'service': (
                    f"{service.name} has no active price configured "
                    f"for {visit.branch.name}."
                )
            })

        return VisitService.objects.create(
            visit=visit,
            service=service,
            service_name=service.name,
            service_code=service.code,
            service_category=service.category,
            original_price=branch_price.price,
            zero_price_reason=branch_price.zero_price_reason,
            duration_minutes=service.duration_minutes,
            requires_timer=service.requires_timer,
            added_by=request.user,
        )


class ServiceAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(
        source='staff.user.get_full_name',
        read_only=True
    )

    staff_number = serializers.CharField(
        source='staff.staff_number',
        read_only=True
    )

    assigned_by_name = serializers.CharField(
        source='assigned_by.get_full_name',
        read_only=True
    )

    completed_by_name = serializers.CharField(
        source='completed_by.get_full_name',
        read_only=True
    )

    removed_by_name = serializers.CharField(
        source='removed_by.get_full_name',
        read_only=True
    )

    is_completed = serializers.BooleanField(read_only=True)

    staff = serializers.PrimaryKeyRelatedField(
        queryset=StaffProfile.objects.select_related('user').all()
    )

    class Meta:
        model = ServiceAssignment

        fields = [
            'id',
            'visit_service',
            'staff',
            'staff_name',
            'staff_number',
            'assigned_by',
            'assigned_by_name',
            'assigned_at',
            'completed_at',
            'completed_by',
            'completed_by_name',
            'is_completed',
            'is_active',
            'removed_at',
            'removed_by',
            'removed_by_name',
            'removal_reason',
        ]

        read_only_fields = [
            'id',
            'visit_service',
            'assigned_by',
            'assigned_by_name',
            'assigned_at',
            'completed_at',
            'completed_by',
            'completed_by_name',
            'is_completed',
            'is_active',
            'removed_at',
            'removed_by',
            'removed_by_name',
            'removal_reason',
        ]


class MyDayAssignmentSerializer(serializers.ModelSerializer):
    """Safe assignment details for the assigned employee only."""

    visit_id = serializers.IntegerField(
        source='visit_service.visit_id',
        read_only=True
    )

    visit_status = serializers.CharField(
        source='visit_service.visit.status',
        read_only=True
    )

    vehicle_registration = serializers.CharField(
        source='visit_service.visit.vehicle.registration_number',
        read_only=True
    )

    vehicle_make_model = serializers.CharField(
        source='visit_service.visit.vehicle.make_model',
        read_only=True
    )

    service_name = serializers.CharField(
        source='visit_service.service_name',
        read_only=True
    )

    service_category = serializers.CharField(
        source='visit_service.service_category',
        read_only=True
    )

    is_completed = serializers.BooleanField(read_only=True)

    can_confirm_completion = serializers.SerializerMethodField()

    class Meta:
        model = ServiceAssignment

        fields = [
            'id',
            'visit_id',
            'visit_status',
            'vehicle_registration',
            'vehicle_make_model',
            'service_name',
            'service_category',
            'assigned_at',
            'is_active',
            'removed_at',
            'removal_reason',
            'completed_at',
            'is_completed',
            'can_confirm_completion',
        ]

        read_only_fields = fields

    def get_can_confirm_completion(self, obj):
        return (
            obj.is_active
            and obj.completed_at is None
        )


class ServiceAssignmentRemovalSerializer(serializers.Serializer):
    removal_reason = serializers.CharField(
        required=True,
        allow_blank=False
    )
