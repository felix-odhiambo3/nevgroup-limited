
from django.urls import path

from .views import (
    ServiceListCreateView,
    ServiceDetailView,
    BranchServicePriceListCreateView,
    BranchServicePriceDetailView,
    BranchServiceCategoryPriceListCreateView,
    BranchServiceCategoryPriceDetailView,
)

urlpatterns = [
    path(
        '',
        ServiceListCreateView.as_view(),
        name='service_list_create'
    ),
    path(
        'branch-prices/',
        BranchServicePriceListCreateView.as_view(),
        name='branch_service_price_list_create'
    ),
    path(
        'branch-prices/<int:pk>/',
        BranchServicePriceDetailView.as_view(),
        name='branch_service_price_detail'
    ),
    path(
        'branch-category-prices/',
        BranchServiceCategoryPriceListCreateView.as_view(),
        name='branch_service_category_price_list_create'
    ),
    path(
        'branch-category-prices/<int:pk>/',
        BranchServiceCategoryPriceDetailView.as_view(),
        name='branch_service_category_price_detail'
    ),
    path(
        '<int:pk>/',
        ServiceDetailView.as_view(),
        name='service_detail'
    ),
]
