# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.

from django.db import models

# if id = models.UUIDField(primary_key=True), JSON request needs to contain an ID field.
# for id to be created auto by Django, use id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

# For auto date in created_at, field should equal to models.DateTimeField(auto_now_add=True)
# For auto date in updated_at, field should equal to models.DateTimeField(auto_now=True)

# TODO: CONFORME FOR AVANÇANDO NO PROJETO, CRIAR APPS PARA MODULARIZAR TUDO E NÃO CRIAR MAIS TUDO DENTRO DE API
# TODO: A IDEIA É QUE ESSA PASTA API DEIXE DE EXISTIR E FIQUE TUDO MODULARIZADO
class Messages(models.Model):
    id = models.UUIDField(primary_key=True)
    sender = models.ForeignKey('users.Users', models.DO_NOTHING)
    receiver = models.ForeignKey('users.Users', models.DO_NOTHING, related_name='messages_receiver_set')
    rental = models.ForeignKey('Rentals', models.DO_NOTHING)
    content = models.TextField()
    sent_at = models.DateTimeField(blank=True, null=True)
    flagged_for_moderation = models.BooleanField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'messages'


class Rentals(models.Model):
    id = models.UUIDField(primary_key=True)
    postings = models.ForeignKey('postings.Postings', models.DO_NOTHING)
    lessee = models.ForeignKey('users.Users', models.DO_NOTHING)
    operator = models.ForeignKey('users.Users', models.DO_NOTHING, related_name='rentals_operator_set', blank=True, null=True)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    total_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    initial_hour_meter = models.IntegerField(blank=True, null=True)
    final_hour_meter = models.IntegerField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'rentals'


class Reviews(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.ForeignKey(Rentals, models.DO_NOTHING)
    reviewer = models.ForeignKey('users.Users', models.DO_NOTHING)
    reviewee = models.ForeignKey('users.Users', models.DO_NOTHING, related_name='reviews_reviewee_set')
    rating = models.IntegerField()
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'reviews'
        unique_together = (('rental', 'reviewer'),)
