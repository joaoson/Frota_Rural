import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('postings', '0001_initial'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Rentals',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('start_date', models.DateTimeField()),
                ('end_date', models.DateTimeField()),
                ('total_price', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('initial_hour_meter', models.IntegerField(blank=True, null=True)),
                ('final_hour_meter', models.IntegerField(blank=True, null=True)),
                ('status', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(blank=True, null=True)),
                ('postings', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='postings.postings')),
                ('lessee', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='users.users')),
                ('operator', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.DO_NOTHING, related_name='rentals_operator_set', to='users.users')),
            ],
            options={
                'db_table': 'rentals',
            },
        ),
        migrations.CreateModel(
            name='Contracts',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('document_url', models.CharField(blank=True, max_length=1024, null=True)),
                ('accepted_by_lessor', models.BooleanField(blank=True, null=True)),
                ('accepted_by_lessee', models.BooleanField(blank=True, null=True)),
                ('status', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('rental', models.OneToOneField(on_delete=django.db.models.deletion.DO_NOTHING, to='api.rentals')),
            ],
            options={
                'db_table': 'contracts',
            },
        ),
        migrations.CreateModel(
            name='Messages',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('content', models.TextField()),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('flagged_for_moderation', models.BooleanField(blank=True, null=True)),
                ('rental', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='api.rentals')),
                ('receiver', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, related_name='messages_receiver_set', to='users.users')),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='users.users')),
            ],
            options={
                'db_table': 'messages',
            },
        ),
        migrations.CreateModel(
            name='Reviews',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('rating', models.IntegerField()),
                ('comment', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('rental', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='api.rentals')),
                ('reviewee', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, related_name='reviews_reviewee_set', to='users.users')),
                ('reviewer', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='users.users')),
            ],
            options={
                'db_table': 'reviews',
                'unique_together': {('rental', 'reviewer')},
            },
        ),
    ]
