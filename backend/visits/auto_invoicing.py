
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError as DRFValidationError

from payments.models import Invoice
from visits.models import Visit, VisitService, ServiceAssignment


@transaction.atomic
def auto_finalize_visit_if_ready(*, visit_id, user):
    """
    Automatically generate an invoice when every active assignment
    across every active service on a visit has been completed.

    The existing invoice workflow remains responsible for invoice
    calculations, VAT, invoice lines, and cleaner commissions.
    """

    # Lock the parent visit first. Both employee and supervisor
    # completion endpoints must use this same lock order.
    visit = (
        Visit.objects
        .select_for_update()
        .get(pk=visit_id)
    )

    if visit.status not in (
        Visit.Status.CHECKED_IN,
        Visit.Status.IN_PROGRESS,
    ):
        return Invoice.objects.filter(visit_id=visit.pk).first()

    # Do not attempt to create a second invoice.
    existing_invoice = Invoice.objects.filter(
        visit_id=visit.pk
    ).first()

    if existing_invoice is not None:
        return existing_invoice

    active_services = list(
        VisitService.objects.filter(
            visit_id=visit.pk,
            is_removed=False,
        ).order_by('pk')
    )

    if not active_services:
        return None

    service_ids = [service.pk for service in active_services]

    assignment_status = list(
        ServiceAssignment.objects.filter(
            visit_service_id__in=service_ids,
            is_active=True,
        )
        .values('visit_service_id')
        .annotate(
            assignment_count=Count('pk'),
            pending_count=Count(
                'pk',
                filter=(
                    Q(completed_at__isnull=True)
                    | Q(completed_by_id__isnull=True)
                ),
            ),
        )
    )

    status_by_service = {
        item['visit_service_id']: item
        for item in assignment_status
    }

    # Every active service must have at least one active assignment.
    for service_id in service_ids:
        service_status = status_by_service.get(service_id)

        if (
            service_status is None
            or service_status['assignment_count'] == 0
        ):
            return None

        # Every active assignment must have both completion fields.
        if service_status['pending_count'] > 0:
            return None

    loyalty_discounts = {
        service.pk: service.loyalty_discount
        for service in active_services
        if service.loyalty_discount > 0
    }

    # Import locally to avoid coupling this helper to the invoice
    # workflow during module initialization.
    from payments.workflows import complete_visit_and_generate_invoice

    try:
        return complete_visit_and_generate_invoice(
            visit_id=visit.pk,
            user=user,
            bargaining_discount=visit.bargaining_discount,
            discount_reason=visit.discount_reason,
            loyalty_discounts=loyalty_discounts,
        )
    except DjangoValidationError as exc:
        if hasattr(exc, 'message_dict'):
            raise DRFValidationError(exc.message_dict)

        raise DRFValidationError({
            'detail': exc.messages,
        })
