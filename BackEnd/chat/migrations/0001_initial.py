import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# A tabela `messages` já existe — criada por api.0001_initial. Aqui só o
# *estado* das migrações muda de app, por isso tudo vai dentro de
# SeparateDatabaseAndState com database_operations vazio: nenhuma tabela é
# criada, apagada ou recriada. Mesma técnica de contracts.0001_initial.
#
# O conjunto de campos abaixo precisa ser byte-idêntico ao CreateModel de
# Messages em api/migrations/0001_initial.py — qualquer divergência (mesmo de
# nullability) gera um AlterField fantasma tentando reescrever a tabela viva.
class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("api", "0003_move_contracts_to_contracts_app"),
        ("postings", "0003_postings_max_reservation_days"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Messages",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("content", models.TextField()),
                        ("sent_at", models.DateTimeField(blank=True, null=True)),
                        ("flagged_for_moderation", models.BooleanField(blank=True, null=True)),
                        (
                            "rental",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to="api.rentals",
                            ),
                        ),
                        (
                            "receiver",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                related_name="messages_receiver_set",
                                to="users.users",
                            ),
                        ),
                        (
                            "sender",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to="users.users",
                            ),
                        ),
                    ],
                    options={
                        "db_table": "messages",
                    },
                ),
            ],
        ),
    ]
