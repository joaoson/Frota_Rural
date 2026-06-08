import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Credentials',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('type', models.TextField()),
                ('document_number', models.CharField(blank=True, max_length=50, null=True)),
                ('expiration_date', models.DateField(blank=True, null=True)),
                ('file_url', models.CharField(blank=True, max_length=1024, null=True)),
                ('status', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'credentials',
            },
        ),
    ]
