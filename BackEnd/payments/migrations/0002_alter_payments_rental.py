import django.db.models.deletion
from django.db import migrations, models


# Par estado-only da extração de `Rentals` para o app `rentals` (ver
# contracts.0002_alter_contracts_rental). A tabela `payments` não é tocada.
class Migration(migrations.Migration):
    dependencies = [
        ("payments", "0001_initial"),
        ("rentals", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="payments",
                    name="rental",
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="rentals.rentals",
                    ),
                ),
            ],
        ),
    ]
