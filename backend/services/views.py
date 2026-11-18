
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from .models import (
    Service,
    BranchServicePrice,
    BranchServiceCategoryPrice,
)

from .serializers import (
    ServiceSerializer,
    BranchServicePriceSerializer,
    BranchServiceCategoryPriceSerializer,
)

from accounts.permissions import IsAdminOrOwner


def get_user_branch(user):
    try:
        return user.staff_profile.branch
    except Exception:
        return None


class ServiceListCreateView(generics.ListCreateAPIView):

    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        queryset = Service.objects.all()

        if (
            not user.is_superuser
            and user.role not in ['ADMIN', 'OWNER']
        ):
            queryset = queryset.filter(is_active=True)

        return queryset

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                IsAdminOrOwner(),
            ]

        return super().get_permissions()


class ServiceDetailView(generics.RetrieveUpdateAPIView):

    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class BranchServicePriceListCreateView(
    generics.ListCreateAPIView
):

    serializer_class = BranchServicePriceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        queryset = BranchServicePrice.objects.select_related(
            'branch',
            'service',
            'created_by',
            'updated_by',
        )

        if user.is_superuser or user.role == 'OWNER':
            branch_id = self.request.query_params.get('branch')

            if branch_id:
                queryset = queryset.filter(branch_id=branch_id)

            return queryset

        branch = get_user_branch(user)

        if branch is None:
            return queryset.none()

        return queryset.filter(branch=branch)

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                IsAdminOrOwner(),
            ]

        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user

        if user.role == 'ADMIN' and not user.is_superuser:
            branch = get_user_branch(user)

            if branch is None:
                raise PermissionDenied(
                    'Your account is not linked to a branch.'
                )

            requested_branch = serializer.validated_data['branch']

            if requested_branch != branch:
                raise PermissionDenied(
                    'You can only manage prices for your own branch.'
                )

        serializer.save(
            created_by=user,
            updated_by=user,
        )


class BranchServicePriceDetailView(
    generics.RetrieveUpdateAPIView
):

    serializer_class = BranchServicePriceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get_queryset(self):
        user = self.request.user

        queryset = BranchServicePrice.objects.select_related(
            'branch',
            'service',
        )

        if user.is_superuser or user.role == 'OWNER':
            return queryset

        branch = get_user_branch(user)

        if branch is None:
            return queryset.none()

        return queryset.filter(branch=branch)

    def perform_update(self, serializer):
        user = self.request.user

        if user.role == 'ADMIN' and not user.is_superuser:
            branch = get_user_branch(user)

            if branch is None:
                raise PermissionDenied(
                    'Your account is not linked to a branch.'
                )

            if serializer.validated_data.get(
                'branch',
                serializer.instance.branch
            ) != branch:
                raise PermissionDenied(
                    'You cannot move a price to another branch.'
                )

        serializer.save(updated_by=user)


class BranchServiceCategoryPriceListCreateView(
    generics.ListCreateAPIView
):

    serializer_class = BranchServiceCategoryPriceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        queryset = BranchServiceCategoryPrice.objects.select_related(
            'branch_service_price',
            'branch_service_price__branch',
            'branch_service_price__service',
            'vehicle_category',
            'created_by',
            'updated_by',
        )

        if user.is_superuser or user.role == 'OWNER':
            branch_id = self.request.query_params.get('branch')

            if branch_id:
                queryset = queryset.filter(
                    branch_service_price__branch_id=branch_id
                )

            return queryset

        branch = get_user_branch(user)

        if branch is None:
            return queryset.none()

        return queryset.filter(
            branch_service_price__branch=branch
        )

    def get_permissions(self):
        if self.request.method == 'POST':
            return [
                IsAuthenticated(),
                IsAdminOrOwner(),
            ]

        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user

        if user.role == 'ADMIN' and not user.is_superuser:
            branch = get_user_branch(user)

            if branch is None:
                raise PermissionDenied(
                    'Your account is not linked to a branch.'
                )

            requested_parent = serializer.validated_data[
                'branch_service_price'
            ]

            if requested_parent.branch != branch:
                raise PermissionDenied(
                    'You can only manage category prices '
                    'for your own branch.'
                )

        serializer.save(
            created_by=user,
            updated_by=user,
        )


class BranchServiceCategoryPriceDetailView(
    generics.RetrieveUpdateAPIView
):

    serializer_class = BranchServiceCategoryPriceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]

    def get_queryset(self):
        user = self.request.user

        queryset = BranchServiceCategoryPrice.objects.select_related(
            'branch_service_price',
            'branch_service_price__branch',
            'branch_service_price__service',
            'vehicle_category',
        )

        if user.is_superuser or user.role == 'OWNER':
            return queryset

        branch = get_user_branch(user)

        if branch is None:
            return queryset.none()

        return queryset.filter(
            branch_service_price__branch=branch
        )

    def perform_update(self, serializer):
        user = self.request.user

        if user.role == 'ADMIN' and not user.is_superuser:
            branch = get_user_branch(user)

            if branch is None:
                raise PermissionDenied(
                    'Your account is not linked to a branch.'
                )

            requested_parent = serializer.validated_data.get(
                'branch_service_price',
                serializer.instance.branch_service_price
            )

            if requested_parent.branch != branch:
                raise PermissionDenied(
                    'You cannot move a category price '
                    'to another branch.'
                )

        serializer.save(updated_by=user)
