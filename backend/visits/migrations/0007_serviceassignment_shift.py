
from datetime import time, timedelta
from zoneinfo import ZoneInfo

from django.db import migrations, models


def backfill_assignment_shifts(apps, schema_editor):
    ServiceAssignment = apps.get_model(
        'visits',
        'ServiceAssignment'
    )
    ShiftAssignment = apps.get_model(
        'staff',
        'ShiftAssignment'
    )

    database = schema_editor.connection.alias
    local_timezone = ZoneInfo('Africa/Nairobi')
    operational_start = time(7, 0)

    assignments = (
        ServiceAssignment.objects.using(database)
        .select_related('visit_service__visit')
        .all()
        .iterator()
    )

    for assignment in assignments:
        arrival_time = assignment.visit_service.visit.arrival_time

        if arrival_time is None:
            continue

        if arrival_time.tzinfo is None:
            continue

        local_arrival = arrival_time.astimezone(local_timezone)
        operational_date = local_arrival.date()

        # The operational day runs from 07:00 to 06:59 the following day.
        if local_arrival.time().replace(tzinfo=None) < operational_start:
            operational_date -= timedelta(days=1)

        historical_shift = (
            ShiftAssignment.objects.using(database)
            .filter(
                staff_id=assignment.staff_id,
                effective_from__lte=operational_date,
            )
            .filter(
                models.Q(effective_to__isnull=True)
                | models.Q(effective_to__gte=operational_date)
            )
            .order_by('-effective_from', '-created_at')
            .first()
        )

        # Never guess when there is no matching historical record.
        if historical_shift is None:
            continue

        ServiceAssignment.objects.using(database).filter(
            pk=assignment.pk
        ).update(
            shift=historical_shift.shift
        )


class Migration(migrations.Migration):

    dependencies = [
        (
            'staff',
            '0003_alter_staffstatushistory_action',
        ),
        (
            'visits',
            '0006_visitservice_zero_price_reason',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='serviceassignment',
            name='shift',
            field=models.CharField(
                blank=True,
                choices=[
                    ('DAY', 'Day'),
                    ('NIGHT', 'Night'),
                ],
                default=None,
                max_length=10,
                null=True,
            ),
        ),
        migrations.RunPython(
            backfill_assignment_shifts,
            migrations.RunPython.noop,
        ),
    ]
