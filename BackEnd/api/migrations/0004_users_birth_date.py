from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_users_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='users',
            name='birth_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
