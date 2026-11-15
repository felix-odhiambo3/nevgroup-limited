
from django.db import migrations


def populate_branch_prices(apps, schema_editor):
    Branch = apps.get_model('branches', 'Branch')
    Service = apps.get_model('services', 'Service')
    BranchServicePrice = apps.get_model(
        'services',
        'BranchServicePrice'
    )

    database = schema_editor.connection.alias

    branches = Branch.objects.using(database).filter(
        is_active=True
    )

    services = Service.objects.using(database).all()

    for branch in branches:
        for service in services:
            zero_reason = ''

            if service.price == 0:
                zero_reason = (
                    'Legacy zero-priced service; '
                    'reason or promotion requires confirmation.'
                )

            BranchServicePrice.objects.using(database).get_or_create(
                branch_id=branch.pk,
                service_id=service.pk,
                defaults={
                    'price': service.price,
                    'zero_price_reason': zero_reason,
                    'is_active': service.is_active,
                }
            )


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('services', '0002_alter_service_price_branchserviceprice'),
    ]

    operations = [
        migrations.RunPython(
            populate_branch_prices,
            migrations.RunPython.noop,
        ),
    ]
