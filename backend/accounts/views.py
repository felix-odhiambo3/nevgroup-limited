from django.contrib.auth import get_user_model

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import UserRoleHistory
from .permissions import IsAdminOrOwner, IsOwner
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    UserListSerializer,
    UserRoleHistorySerializer,
)

User = get_user_model()


def get_manageable_users(request):
    queryset = User.objects.all()

    if (
        not request.user.is_superuser
        and request.user.role != User.Role.OWNER
    ):
        queryset = queryset.exclude(
            role=User.Role.OWNER
        ).exclude(
            is_superuser=True
        )

    return queryset


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')

        if not refresh_token:
            return Response(
                {'error': 'Refresh token is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            token = RefreshToken(refresh_token)

            if token['user_id'] != request.user.id:
                return Response(
                    {'error': 'Invalid refresh token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            token.blacklist()

            return Response(
                {'message': 'Successfully logged out.'},
                status=status.HTTP_200_OK
            )

        except TokenError:
            return Response(
                {'error': 'Invalid or expired refresh token.'},
                status=status.HTTP_400_BAD_REQUEST
            )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'is_superuser': user.is_superuser,
        })


class OwnerTestView(APIView):
    permission_classes = [IsOwner]

    def get(self, request):
        return Response({
            'message': 'Access granted. You are an Owner.',
            'role': request.user.role,
        })


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrOwner]

    def get_queryset(self):
        return get_manageable_users(self.request).order_by(
            '-date_joined'
        )

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UserCreateSerializer

        return UserListSerializer


class UserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminOrOwner]
    serializer_class = UserUpdateSerializer

    def get_queryset(self):
        return get_manageable_users(self.request)


class UserDeactivateView(APIView):
    permission_classes = [IsAdminOrOwner]

    def patch(self, request, pk):
        try:
            user = get_manageable_users(request).get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if user.pk == request.user.pk:
            return Response(
                {'error': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = False
        user.save(update_fields=['is_active'])

        return Response(
            {'message': 'User successfully deactivated.'},
            status=status.HTTP_200_OK
        )


class UserRoleHistoryView(generics.ListAPIView):
    permission_classes = [IsAdminOrOwner]
    serializer_class = UserRoleHistorySerializer

    def get_queryset(self):
        try:
            user = get_manageable_users(
                self.request
            ).get(pk=self.kwargs['pk'])
        except User.DoesNotExist:
            return UserRoleHistory.objects.none()

        return UserRoleHistory.objects.filter(
            user=user
        ).select_related(
            'user',
            'changed_by',
        ).order_by(
            '-created_at',
            '-id',
        )

    def list(self, request, *args, **kwargs):
        if not get_manageable_users(request).filter(
            pk=self.kwargs['pk']
        ).exists():
            return Response(
                {'error': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        return super().list(request, *args, **kwargs)