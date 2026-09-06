from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_users_city_users_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="users",
            name="employer",
            field=models.ForeignKey(
                blank=True,
                db_column="employer_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="operators",
                to="users.users",
            ),
        ),
    ]
