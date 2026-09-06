from django.db import migrations


# Par estado-only de chat.0001_initial: o modelo Messages sai do app `api` e
# passa a viver em `chat`. A tabela `messages` no banco não é tocada.
class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_move_contracts_to_contracts_app"),
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="Messages"),
            ],
        ),
    ]
