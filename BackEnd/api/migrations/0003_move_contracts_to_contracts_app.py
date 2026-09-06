from django.db import migrations


# Contrapartida de contracts.0001: os três modelos passam a pertencer ao app
# `contracts`, então saem do estado de `api`. Novamente sem tocar no banco —
# as tabelas continuam exatamente onde estão.
class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_contractsignatureotps_contractsignatures"),
        ("contracts", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="ContractSignatures"),
                migrations.DeleteModel(name="ContractSignatureOtps"),
                migrations.DeleteModel(name="Contracts"),
            ],
        ),
    ]
