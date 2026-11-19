
from rest_framework import serializers

from .models import (
    Service,
    BranchServicePrice,
    BranchServiceCategoryPrice,
)


class ServiceSerializer(serializers.ModelSerializer):

    class Meta:
        model = Service
        fields = [
            'id',
            'name',
            'code',
            'category',
            'description',
            'pricing_mode',
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

        pricing_mode = attrs.get(
            'pricing_mode',
            getattr(
                self.instance,
                'pricing_mode',
                Service.PricingMode.FIXED
            )
        )

        if category == Service.Category.DETAILING:
            attrs['requires_timer'] = False

        if self.instance:
            if (
                pricing_mode != self.instance.pricing_mode
                and self.instance.branch_prices.exists()
            ):
                raise serializers.ValidationError({
                    'pricing_mode': (
                        'The pricing method cannot be changed after '
                        'branch pricing records have been created.'
                    )
                })

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

    pricing_mode = serializers.CharField(
        source='service.pricing_mode',
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
            'pricing_mode',
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
        if value is not None and value < 0:
            raise serializers.ValidationError(
                "Branch service price cannot be negative."
            )

        return value

    def validate(self, attrs):
        branch = attrs.get(
            'branch',
            getattr(self.instance, 'branch', None)
        )

        service = attrs.get(
            'service',
            getattr(self.instance, 'service', None)
        )

        price = attrs.get(
            'price',
            getattr(self.instance, 'price', None)
        )

        reason = attrs.get(
            'zero_price_reason',
            getattr(self.instance, 'zero_price_reason', '')
        )

        if service:
            if service.pricing_mode == Service.PricingMode.FIXED:
                if price is None:
                    raise serializers.ValidationError({
                        'price': (
                            'A price is required for a fixed-price service.'
                        )
                    })

                if price == 0 and not str(reason).strip():
                    raise serializers.ValidationError({
                        'zero_price_reason': (
                            'A reason or promotion is required '
                            'for a zero-priced service.'
                        )
                    })

                if price > 0:
                    attrs['zero_price_reason'] = ''

            else:
                if price is not None:
                    raise serializers.ValidationError({
                        'price': (
                            'This service uses variable pricing. '
                            'Its branch-level price must be blank.'
                        )
                    })

                attrs['zero_price_reason'] = ''

        if branch and service:
            existing = BranchServicePrice.objects.filter(
                branch=branch,
                service=service,
            )

            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise serializers.ValidationError(
                    'A price configuration for this service already '
                    'exists at this branch. Update the existing record.'
                )

        return attrs


class BranchServiceCategoryPriceSerializer(
    serializers.ModelSerializer
):

    branch_name = serializers.CharField(
        source='branch_service_price.branch.name',
        read_only=True
    )

    service_name = serializers.CharField(
        source='branch_service_price.service.name',
        read_only=True
    )

    service_code = serializers.CharField(
        source='branch_service_price.service.code',
        read_only=True
    )

    vehicle_category_name = serializers.CharField(
        source='vehicle_category.name',
        read_only=True
    )

    class Meta:
        model = BranchServiceCategoryPrice
        fields = [
            'id',
            'branch_service_price',
            'branch_name',
            'service_name',
            'service_code',
            'vehicle_category',
            'vehicle_category_name',
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
                "Category price cannot be negative."
            )

        return value

    def validate(self, attrs):
        branch_service_price = attrs.get(
            'branch_service_price',
            getattr(self.instance, 'branch_service_price', None)
        )

        vehicle_category = attrs.get(
            'vehicle_category',
            getattr(self.instance, 'vehicle_category', None)
        )

        price = attrs.get(
            'price',
            getattr(self.instance, 'price', None)
        )

        reason = attrs.get(
            'zero_price_reason',
            getattr(self.instance, 'zero_price_reason', '')
        )

        if branch_service_price:
            service = branch_service_price.service

            if service.pricing_mode != Service.PricingMode.VEHICLE_CATEGORY:
                raise serializers.ValidationError({
                    'branch_service_price': (
                        'Category prices can only be added to a '
                        'vehicle-category-priced service.'
                    )
                })

            if branch_service_price.price is not None:
                raise serializers.ValidationError({
                    'branch_service_price': (
                        'The parent branch service price must be blank.'
                    )
                })

        if price == 0 and not str(reason).strip():
            raise serializers.ValidationError({
                'zero_price_reason': (
                    'A reason or promotion is required '
                    'for a zero-priced category price.'
                )
            })

        if price is not None and price > 0:
            attrs['zero_price_reason'] = ''

        if branch_service_price and vehicle_category:
            existing = BranchServiceCategoryPrice.objects.filter(
                branch_service_price=branch_service_price,
                vehicle_category=vehicle_category,
            )

            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise serializers.ValidationError(
                    'A price for this vehicle category already exists '
                    'for this service at this branch.'
                )

        return attrs
