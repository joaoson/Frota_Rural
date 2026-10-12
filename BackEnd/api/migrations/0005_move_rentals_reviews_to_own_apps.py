from django.db import migrations


# Contrapartida de rentals.0001 e reviews.0001: os dois últimos modelos do app
# `api` saem do seu estado. Nenhuma tabela é tocada. Depois desta migração o
# `api` não tem mais modelos e só continua instalado para preservar o histórico
# de migrações do qual contracts, chat e payments dependem.
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
                migrations.DeleteModel(name="Rentals"),
            ],
        ),
    ]
