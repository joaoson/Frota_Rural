import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# A tabela `rentals` já existe — criada por api.0001_initial. Aqui só o
# *estado* das migrações muda de app, por isso tudo vai dentro de
# SeparateDatabaseAndState com database_operations vazio: nenhuma tabela é
# criada, apagada ou recriada. Mesma técnica de contracts.0001 e chat.0001.
#
# Os campos precisam ser idênticos ao CreateModel de Rentals em
# api/migrations/0001_initial.py; qualquer divergência vira um AlterField
# fantasma tentando reescrever a tabela viva.
class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("api", "0004_move_messages_to_chat_app"),
        ("postings", "0003_postings_max_reservation_days"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Rentals",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("start_date", models.DateTimeField()),
                        ("end_date", models.DateTimeField()),
                        (
                            "total_price",
                            models.DecimalField(
                                blank=True, decimal_places=2, max_digits=10, null=True
                            ),
                        ),
                        ("initial_hour_meter", models.IntegerField(blank=True, null=True)),
                        ("final_hour_meter", models.IntegerField(blank=True, null=True)),
                        ("status", models.TextField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(blank=True, null=True)),
                        ("updated_at", models.DateTimeField(blank=True, null=True)),
                        (
                            "postings",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to="postings.postings",
                            ),
                        ),
                        (
                            "lessee",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                        (
                            "operator",
                            models.ForeignKey(
                                blank=True,
                                null=True,
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                related_name="rentals_operator_set",
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                    ],
                    options={
                        "db_table": "rentals",
                    },
                ),
            ],
        ),
    ]
