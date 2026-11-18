
import os
from secrets import compare_digest

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, AllowAny
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


def valid_diagnostic_token(request):
    expected_token = os.environ.get(
        "PRODUCTION_DIAGNOSTIC_TOKEN",
        ""
    )
    supplied_token = request.headers.get(
        "X-Production-Diagnostic-Token",
        ""
    )

    return bool(
        expected_token
        and supplied_token
        and compare_digest(supplied_token, expected_token)
    )


class ProductionUserDiagnosticView(APIView):
    """
    Temporary, read-only production account diagnostic.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not valid_diagnostic_token(request):
            return Response(
                {"detail": "Not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        if request.query_params.get("list") == "1":
            users = User.objects.all().order_by("username")

            user_records = list(
                users.values(
                    "username",
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                )
            )

            return Response({
                "total_users": len(user_records),
                "users": user_records,
            })

        username = request.query_params.get(
            "username",
            ""
        ).strip()

        if not username:
            return Response(
                {
                    "detail": (
                        "Provide a username parameter "
                        "or use ?list=1."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.filter(
            username__iexact=username
        ).first()

        if not user:
            return Response({
                "exists": False,
                "username": username,
            })

        return Response({
            "exists": True,
            "username": user.username,
            "role": user.role,
            "is_active": user.is_active,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
        })


class ProductionOwnerBootstrapView(APIView):
    """
    Temporary one-time endpoint for creating the initial production Owner.
    It refuses to run if any user already exists.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        if not valid_diagnostic_token(request):
            return Response(
                {"detail": "Not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        email = request.data.get("email", "").strip()
        password = request.data.get("password", "")

        if not email or not password:
            return Response(
                {"detail": "Email and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_email(email)
            validate_password(password)
        except ValidationError as exc:
            return Response(
                {"detail": exc.messages},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                if User.objects.exists():
                    return Response(
                        {
                            "detail": (
                                "Owner provisioning refused: "
                                "a user account already exists."
                            )
                        },
                        status=status.HTTP_409_CONFLICT
                    )

                user = User.objects.create_superuser(
                    username="Owner",
                    email=email,
                    password=password,
                    role=User.Role.OWNER,
                )

        except Exception:
            return Response(
                {
                    "detail": (
                        "Owner provisioning failed. "
                        "Check the server logs before retrying."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "message": "Initial production Owner created successfully.",
                "username": user.username,
                "role": user.role,
                "is_active": user.is_active,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
            },
            status=status.HTTP_201_CREATED
        )


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
