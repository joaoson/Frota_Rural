from django.db import migrations
from api.migration_operations import DeleteLegacyRentalState


# Contrapartida de rentals.0001 e reviews.0001: os dois últimos modelos do app
# `api` saem do seu estado. Nenhuma tabela é tocada. RentalRecurrence, quando
# instalado pelo ramo de recorrência, permanece no app histórico. Os campos e
# vínculos adicionados por esse ramo acompanham Rentals para o app de domínio.
class Migration(migrations.Migration):
    dependencies = [
        ("api", "0004_move_messages_to_chat_app"),
        ("reviews", "0001_initial"),
        ("contracts", "0002_alter_contracts_rental"),
        ("chat", "0003_alter_messages_rental"),
        ("payments", "0002_alter_payments_rental"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="Reviews"),
                DeleteLegacyRentalState(name="Rentals"),
            ],
        ),
    ]
