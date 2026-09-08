from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("machines", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="machines",
            name="power_cv",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="machines",
            name="hour_meter",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="machines",
            name="hour_meter_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
