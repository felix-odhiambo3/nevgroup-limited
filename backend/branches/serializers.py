
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
