from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0005_user_enum_choices")]

    operations = [
        migrations.AddField(
            model_name="users",
            name="profile_photo",
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
    ]
