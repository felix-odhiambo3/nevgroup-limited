
from rest_framework import serializers

from branches.models import Branch
from .models import Service, BranchServicePrice


class ServiceSerializer(serializers.ModelSerializer):

    class Meta:
        model = Service
        fields = [
            'id',
            'name',
            'code',
            'category',
            'description',
            'price',
            'duration_minutes',
            'requires_timer',
            'is_active',
            'created_at',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
        ]

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Service price cannot be negative."
            )

        return value

    def validate_duration_minutes(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                "Service duration must be greater than zero."
            )

        return value

    def validate(self, attrs):
        category = attrs.get(
            'category',
            getattr(self.instance, 'category', None)
        )

        if category == Service.Category.DETAILING:
            attrs['requires_timer'] = False

        return attrs


class BranchServicePriceSerializer(serializers.ModelSerializer):

    branch_name = serializers.CharField(
        source='branch.name',
        read_only=True
    )

    service_name = serializers.CharField(
        source='service.name',
        read_only=True
    )

    service_code = serializers.CharField(
        source='service.code',
        read_only=True
    )

    class Meta:
        model = BranchServicePrice
        fields = [
            'id',
            'branch',
            'branch_name',
            'service',
            'service_name',
            'service_code',
            'price',
            'zero_price_reason',
            'is_active',
            'created_by',
            'updated_by',
            'created_at',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'created_by',
            'updated_by',
            'created_at',
            'updated_at',
        ]

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Branch service price cannot be negative."
            )

        return value

    def validate(self, attrs):
        price = attrs.get(
            'price',
            getattr(self.instance, 'price', None)
        )

        reason = attrs.get(
            'zero_price_reason',
            getattr(self.instance, 'zero_price_reason', '')
        )

        if price == 0 and not str(reason).strip():
            raise serializers.ValidationError({
                'zero_price_reason': (
                    'A reason or promotion is required '
                    'for a zero-priced service.'
                )
            })

        if price is not None and price > 0:
            attrs['zero_price_reason'] = ''

        branch = attrs.get(
            'branch',
            getattr(self.instance, 'branch', None)
        )

        service = attrs.get(
            'service',
            getattr(self.instance, 'service', None)
        )

        if branch and service:
            existing = BranchServicePrice.objects.filter(
                branch=branch,
                service=service,
            )

            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise serializers.ValidationError(
                    'A price for this service already exists '
                    'at this branch. Update the existing record.'
                )

        return attrs
