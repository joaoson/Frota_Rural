import django.db.models.deletion
from django.db import migrations, models


# Par estado-only da extração de `Rentals` para o app `rentals` (ver
# contracts.0002_alter_contracts_rental). A tabela `messages` não é tocada.
class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_thread_scope_read_receipts"),
        ("rentals", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="messages",
                    name="rental",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        to="rentals.rentals",
                    ),
                ),
            ],
        ),
    ]
