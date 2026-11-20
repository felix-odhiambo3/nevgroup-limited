
from rest_framework import serializers

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):

    class Meta:
        model = Branch

        fields = [
            'id',
            'name',
            'code',
            'town',
            'address',
            'phone',
            'email',
            'daily_revenue_target',
            'latitude',
            'longitude',
            'attendance_radius',
            'is_active',
            'created_at',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
        ]

    def validate_daily_revenue_target(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Daily revenue target cannot be negative."
            )

        return value

    def validate_attendance_radius(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Attendance radius must be at least 1 metre."
            )

        return value
    def validate(self, attrs):
        latitude = attrs.get(
            'latitude',
            self.instance.latitude if self.instance else None,
        )

        longitude = attrs.get(
            'longitude',
            self.instance.longitude if self.instance else None,
        )

        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError({
                'latitude': (
                    'Latitude and longitude must both be provided '
                    'or both be empty.'
                ),
                'longitude': (
                    'Latitude and longitude must both be provided '
                    'or both be empty.'
                ),
            })

        return attrs