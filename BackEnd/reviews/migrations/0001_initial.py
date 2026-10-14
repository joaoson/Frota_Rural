import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# A tabela `reviews` já existe — criada por api.0001_initial. Só o estado muda
# de app (ver rentals.0001_initial para o porquê do SeparateDatabaseAndState).
class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("rentals", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Reviews",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("rating", models.IntegerField()),
                        ("comment", models.TextField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(blank=True, null=True)),
                        (
                            "rental",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to="rentals.rentals",
                            ),
                        ),
                        (
                            "reviewee",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                related_name="reviews_reviewee_set",
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                        (
                            "reviewer",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                    ],
                    options={
                        "db_table": "reviews",
                        "unique_together": {("rental", "reviewer")},
                    },
                ),
            ],
        ),
    ]
