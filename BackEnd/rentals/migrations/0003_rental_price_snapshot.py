from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations, models
from django.utils import timezone

CENTAVOS = Decimal("0.01")
HORAS_POR_DIARIA = 8
TAXA_PLATAFORMA = Decimal("0.05")


def backfill_price_snapshots(apps, schema_editor):
    """Congela a cotação das locações existentes a partir do valor acordado.

    O valor acordado é o do pagamento aprovado mais recente, quando houver; senão
    o `total_price` gravado. Um pagamento aprovado que diverge de `total_price`
    é o defeito de recálculo da auditoria (ADR 0002): o pagamento prevalece.
    """
    Rentals = apps.get_model("rentals", "Rentals")
    Payments = apps.get_model("payments", "Payments")
    approved = dict(
        Payments.objects.filter(status="approved").order_by("created_at").values_list("rental_id", "amount")
    )
    for rental in Rentals.objects.filter(priced_at__isnull=True).iterator():
        total = approved.get(rental.pk, rental.total_price)
        if total is None or not rental.start_date or not rental.end_date:
            continue
        days = (rental.end_date.date() - rental.start_date.date()).days + 1
        if days <= 0:
            continue
        subtotal = (Decimal(total) / (1 + TAXA_PLATAFORMA)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)
        daily_rate = (subtotal / days).quantize(CENTAVOS, rounding=ROUND_HALF_UP)
        Rentals.objects.filter(pk=rental.pk).update(
            total_price=total,
            hourly_rate_snapshot=(daily_rate / HORAS_POR_DIARIA).quantize(CENTAVOS, rounding=ROUND_HALF_UP),
            daily_rate=daily_rate,
            billable_days=days,
            subtotal=subtotal,
            platform_fee_rate=TAXA_PLATAFORMA,
            platform_fee=Decimal(total) - subtotal,
            priced_at=rental.created_at or timezone.now(),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("rentals", "0002_enum_choices"),
        ("payments", "0004_alter_payments_status"),
        # Every existing rental column must exist before the backfill reads rows.
        ("api", "0007_merge_rental_histories"),
    ]

    operations = [
        migrations.AddField(
            model_name="rentals",
            name="hourly_rate_snapshot",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="daily_rate",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="billable_days",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="subtotal",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="platform_fee_rate",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="platform_fee",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="rentals",
            name="priced_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_price_snapshots, migrations.RunPython.noop),
    ]
