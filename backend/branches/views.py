
from django.db import transaction

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import Branch, BranchLocationAudit
from .serializers import BranchSerializer
from accounts.permissions import IsAdminOrOwner


class BranchListCreateView(generics.ListCreateAPIView):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class BranchDetailView(generics.RetrieveUpdateAPIView):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def perform_update(self, serializer):
        with transaction.atomic():
            branch = serializer.instance

            old_values = (
                branch.latitude,
                branch.longitude,
                branch.attendance_radius,
            )

            updated_branch = serializer.save()

            new_values = (
                updated_branch.latitude,
                updated_branch.longitude,
                updated_branch.attendance_radius,
            )

            if old_values != new_values:
                BranchLocationAudit.objects.create(
                    branch=updated_branch,
                    changed_by=self.request.user,
                    old_latitude=old_values[0],
                    old_longitude=old_values[1],
                    old_attendance_radius=old_values[2],
                    new_latitude=new_values[0],
                    new_longitude=new_values[1],
                    new_attendance_radius=new_values[2],
                )
