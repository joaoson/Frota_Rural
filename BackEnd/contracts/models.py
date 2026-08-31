from django.db import models


class Contracts(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.OneToOneField('api.Rentals', models.DO_NOTHING)
    document_url = models.CharField(max_length=1024, blank=True, null=True)
    accepted_by_lessor = models.BooleanField(blank=True, null=True)
    accepted_by_lessee = models.BooleanField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'contracts'


class ImmutableRecordError(Exception):
    """Levantada ao tentar alterar ou remover uma evidência já gravada."""


class ContractSignatures(models.Model):
    """Registro append-only do aceite eletrônico de cada parte.

    É a evidência que sustenta a assinatura eletrônica simples perante a
    MP 2.200-2/2001 e a Lei 14.063/2020. Nada aqui pode ser alterado depois de
    gravado: ``save`` e ``delete`` recusam qualquer modificação, e a migração
    0001 deste app herda as triggers que bloqueiam UPDATE/DELETE também no
    banco, para o caso de alguém escrever direto na tabela.
    """

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
    """Código de uso único enviado por e-mail antes do aceite.

    Comprova que quem assinou tem posse do endereço de e-mail cadastrado.
    Guardamos apenas o hash do código; o valor em claro só existe no e-mail.
    """

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
