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
class Contracts(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.OneToOneField('Rentals', models.DO_NOTHING)
    document_url = models.CharField(max_length=1024, blank=True, null=True)
    accepted_by_lessor = models.BooleanField(blank=True, null=True)
    accepted_by_lessee = models.BooleanField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'contracts'


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


class ImmutableRecordError(Exception):
    """Levantada ao tentar alterar ou remover uma evidência já gravada."""


class ContractSignatures(models.Model):

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name='signatures')

    # Quem aceitou. Guardamos nome e e-mail no próprio registro além da FK:
    # se o cadastro mudar depois, a evidência preserva o que valia no aceite.
    signer = models.ForeignKey('users.Users', models.DO_NOTHING, blank=True, null=True)
    signer_name = models.CharField(max_length=255, blank=True)
    signer_email = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20)  # 'locador' ou 'locatario'

    # O que foi aceito: hash do documento exato + versão do modelo.
    document_version = models.CharField(max_length=20, blank=True)
    document_hash = models.CharField(max_length=64)
    hash_algorithm = models.CharField(max_length=20, default='sha256')

    # Quando, de onde e com qual cliente.
    signed_at = models.DateTimeField()  # sempre UTC, gerado pelo servidor
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=1024, blank=True)

    # Posse do e-mail comprovada por OTP antes do aceite.
    otp_verified = models.BooleanField(default=False)

    # Encadeamento: torna a adulteração de um registro antigo detectável.
    previous_hash = models.CharField(max_length=64)
    record_hash = models.CharField(max_length=64, unique=True)

    class Meta:
        db_table = 'contract_signatures'
        ordering = ['signed_at', 'id']
        indexes = [
            models.Index(fields=['contract', 'signed_at']),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableRecordError(
                "Evidências de assinatura são append-only e não podem ser alteradas."
            )
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableRecordError(
            "Evidências de assinatura são append-only e não podem ser removidas."
        )

    def __str__(self):
        return f"{self.role} @ {self.signed_at.isoformat()} ({self.document_hash[:12]})"


class ContractSignatureOtps(models.Model):

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name='signature_otps')
    role = models.CharField(max_length=20)
    email = models.CharField(max_length=255)
    code_hash = models.CharField(max_length=64)
    attempts = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'contract_signature_otps'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['contract', 'role', '-created_at']),
        ]

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    @property
    def is_usable(self):
        return self.consumed_at is None and not self.is_expired
