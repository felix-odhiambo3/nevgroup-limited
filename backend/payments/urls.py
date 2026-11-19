
from django.urls import path

from payments.views import (
    InvoiceListView,
    InvoiceDetailView,
    PaymentCollectionListView,
    PaymentCollectionDetailView,
    InvoicePaymentCollectionCreateView,
    PaymentReversalListView,
    PaymentReversalCreateView,
)

urlpatterns = [
    path(
        'invoices/',
        InvoiceListView.as_view(),
        name='payment-invoice-list',
    ),
    path(
        'invoices/<int:invoice_id>/',
        InvoiceDetailView.as_view(),
        name='payment-invoice-detail',
    ),
    path(
        'invoices/<int:invoice_id>/collections/',
        InvoicePaymentCollectionCreateView.as_view(),
        name='payment-collection-create',
    ),
    path(
        'collections/',
        PaymentCollectionListView.as_view(),
        name='payment-collection-list',
    ),
    path(
        'collections/<int:collection_id>/',
        PaymentCollectionDetailView.as_view(),
        name='payment-collection-detail',
    ),
    path(
        'reversals/',
        PaymentReversalListView.as_view(),
        name='payment-reversal-list',
    ),
    path(
        'entries/<int:payment_entry_id>/reversals/',
        PaymentReversalCreateView.as_view(),
        name='payment-reversal-create',
    ),
]
