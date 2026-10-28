import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# As tabelas já existem — foram criadas por api.0001 e api.0002, junto das
# triggers append-only. Aqui só o *estado* das migrações muda de app, por isso
# tudo vai dentro de SeparateDatabaseAndState com database_operations vazio:
# nenhuma tabela é criada, apagada ou recriada, e nenhuma evidência de
# assinatura é perdida no caminho.
class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("api", "0002_contractsignatureotps_contractsignatures"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Contracts",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("document_url", models.CharField(blank=True, max_length=1024, null=True)),
                        ("accepted_by_lessor", models.BooleanField(blank=True, null=True)),
                        ("accepted_by_lessee", models.BooleanField(blank=True, null=True)),
                        ("status", models.TextField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(blank=True, null=True)),
                        (
                            "rental",
                            models.OneToOneField(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to="api.rentals",
                            ),
                        ),
                    ],
                    options={
                        "db_table": "contracts",
                    },
                ),
                migrations.CreateModel(
                    name="ContractSignatureOtps",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("role", models.CharField(max_length=20)),
                        ("email", models.CharField(max_length=255)),
                        ("code_hash", models.CharField(max_length=64)),
                        ("attempts", models.IntegerField(default=0)),
                        ("expires_at", models.DateTimeField()),
                        ("consumed_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField()),
                        (
                            "contract",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                related_name="signature_otps",
                                to="contracts.contracts",
                            ),
                        ),
                    ],
                    options={
                        "db_table": "contract_signature_otps",
                        "ordering": ["-created_at"],
                        "indexes": [
                            models.Index(
                                fields=["contract", "role", "-created_at"],
                                name="contract_si_contrac_fcb9f7_idx",
                            )
                        ],
                    },
                ),
                migrations.CreateModel(
                    name="ContractSignatures",
                    fields=[
                        ("id", models.UUIDField(primary_key=True, serialize=False)),
                        ("signer_name", models.CharField(blank=True, max_length=255)),
                        ("signer_email", models.CharField(blank=True, max_length=255)),
                        ("role", models.CharField(max_length=20)),
                        ("document_version", models.CharField(blank=True, max_length=20)),
                        ("document_hash", models.CharField(max_length=64)),
                        ("hash_algorithm", models.CharField(default="sha256", max_length=20)),
                        ("signed_at", models.DateTimeField()),
                        ("ip_address", models.CharField(blank=True, max_length=64)),
                        ("user_agent", models.CharField(blank=True, max_length=1024)),
                        ("otp_verified", models.BooleanField(default=False)),
                        ("previous_hash", models.CharField(max_length=64)),
                        ("record_hash", models.CharField(max_length=64, unique=True)),
                        (
                            "contract",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                related_name="signatures",
                                to="contracts.contracts",
                            ),
                        ),
                        (
                            "signer",
                            models.ForeignKey(
                                blank=True,
                                null=True,
                                on_delete=django.db.models.deletion.DO_NOTHING,
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                    ],
                    options={
                        "db_table": "contract_signatures",
                        "ordering": ["signed_at", "id"],
                        "indexes": [
                            models.Index(
                                fields=["contract", "signed_at"],
                                name="contract_si_contrac_aabd44_idx",
                            )
                        ],
                    },
                ),
            ],
        ),
    ]
