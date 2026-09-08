import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("machines", "0002_machines_power_cv_hour_meter"),
        ("postings", "0003_postings_max_reservation_days"),
    ]

    operations = [
        migrations.CreateModel(
            name="MachineValuations",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("brand", models.CharField(max_length=100)),
                ("model", models.CharField(max_length=100)),
                ("year", models.IntegerField(blank=True, null=True)),
                ("payload", models.JSONField()),
                ("confidence", models.CharField(max_length=10)),
                ("researched_at", models.DateTimeField()),
                ("expires_at", models.DateTimeField()),
            ],
            options={
                "db_table": "machine_valuations",
                "unique_together": {("brand", "model", "year")},
            },
        ),
        migrations.AddIndex(
            model_name="machinevaluations",
            index=models.Index(
                fields=["brand", "model", "year"],
                name="machine_val_brand_idx",
            ),
        ),
        migrations.CreateModel(
            name="PricingSuggestions",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("suggested_hourly_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("cost_hourly_rate", models.DecimalField(decimal_places=2, max_digits=10)),
                ("range_min", models.DecimalField(decimal_places=2, max_digits=10)),
                ("range_max", models.DecimalField(decimal_places=2, max_digits=10)),
                ("source", models.CharField(max_length=20)),
                ("confidence", models.CharField(max_length=10)),
                ("params_version", models.CharField(max_length=20)),
                ("inputs", models.JSONField()),
                ("breakdown", models.JSONField()),
                ("accepted_hourly_rate", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("created_at", models.DateTimeField()),
                (
                    "machinery",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        to="machines.machines",
                    ),
                ),
                (
                    "posting",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        to="postings.postings",
                    ),
                ),
            ],
            options={
                "db_table": "pricing_suggestions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="pricingsuggestions",
            index=models.Index(
                fields=["machinery", "-created_at"],
                name="pricing_sug_machine_idx",
            ),
        ),
    ]
