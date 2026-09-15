import django.db.models.deletion
from django.db import migrations, models


# `Rentals` saiu do app `api` para o app `rentals`. A FK continua apontando para
# a mesma tabela, então só o estado muda: sem o SeparateDatabaseAndState o
# Django derrubaria e recriaria a constraint à toa.
class Migration(migrations.Migration):
    dependencies = [
        ("contracts", "0001_initial"),
        ("rentals", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="contracts",
                    name="rental",
                    field=models.OneToOneField(
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        to="rentals.rentals",
                    ),
                ),
            ],
        ),
    ]
