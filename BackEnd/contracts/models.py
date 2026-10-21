from typing import Any, NoReturn

from django.db import models
from django.utils import timezone

from contracts.enums import AmendmentStatus, ContractStatus, RevisionReason, SignatureRole


class Contracts(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.OneToOneField("rentals.Rentals", models.DO_NOTHING)
    document_url = models.CharField(max_length=1024, blank=True, null=True)
    accepted_by_lessor = models.BooleanField(blank=True, null=True)
    accepted_by_lessee = models.BooleanField(blank=True, null=True)
    status = models.TextField(choices=ContractStatus.choices, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    signature_deadline = models.DateTimeField(blank=True, null=True)
    # Versão congelada que as duas partes assinam. Nula em contratos ainda não
    # pagos (o documento é só uma prévia) e nos legados, assinados antes das
    # revisões existirem.
    current_revision = models.ForeignKey(
        "ContractRevisions", models.DO_NOTHING, related_name="+", blank=True, null=True,
    )

    class Meta:
        db_table = "contracts"

    def __str__(self) -> str:
        return f"#CTR-{str(self.rental_id)[:4].upper()}"


class ImmutableRecordError(Exception):
    """Levantada ao tentar alterar ou remover uma evidência já gravada."""


class ContractRevisions(models.Model):
    """Documento completo do contrato, congelado. É exatamente o que se assina.

    Append-only como as assinaturas: `save`/`delete` recusam alterações e a
    migração 0004 deste app bloqueia UPDATE/DELETE no banco. Mudanças de cadastro,
    anúncio ou modelo de cláusulas depois do congelamento não alteram o que foi
    aceito; um aditivo cria uma nova revisão.
    """

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name="revisions")
    number = models.PositiveIntegerField()
    document = models.JSONField()
    document_hash = models.CharField(max_length=64)
    document_version = models.CharField(max_length=20)
    reason = models.CharField(max_length=20, choices=RevisionReason.choices)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "contract_revisions"
        ordering = ["contract", "number"]
        constraints = [
            models.UniqueConstraint(fields=["contract", "number"], name="unique_contract_revision_number"),
        ]

    def __str__(self) -> str:
        return f"Revisão {self.number} ({self.document_hash[:12]})"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ImmutableRecordError("Revisões de contrato são append-only e não podem ser alteradas.")
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> NoReturn:
        raise ImmutableRecordError("Revisões de contrato são append-only e não podem ser removidas.")


class ContractSignatures(models.Model):
    """Registro append-only do aceite eletrônico de cada parte.

    É a evidência que sustenta a assinatura eletrônica simples perante a
    MP 2.200-2/2001 e a Lei 14.063/2020. Nada aqui pode ser alterado depois de
    gravado: ``save`` e ``delete`` recusam qualquer modificação, e a migração
    0001 deste app herda as triggers que bloqueiam UPDATE/DELETE também no
    banco, para o caso de alguém escrever direto na tabela.
    """

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name="signatures")
    # Revisão aceita. Nula só nas assinaturas legadas, anteriores às revisões.
    revision = models.ForeignKey(
        ContractRevisions, models.DO_NOTHING, related_name="signatures", blank=True, null=True,
    )

    # Quem aceitou. Guardamos nome e e-mail no próprio registro além da FK:
    # se o cadastro mudar depois, a evidência preserva o que valia no aceite.
    signer = models.ForeignKey("users.Users", models.DO_NOTHING, blank=True, null=True)
    signer_name = models.CharField(max_length=255, blank=True)
    signer_email = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=SignatureRole.choices)

    # O que foi aceito: hash do documento exato + versão do modelo.
    document_version = models.CharField(max_length=20, blank=True)
    document_hash = models.CharField(max_length=64)
    hash_algorithm = models.CharField(max_length=20, default="sha256")

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
        db_table = "contract_signatures"
        ordering = ["signed_at", "id"]
        indexes = [
            models.Index(fields=["contract", "signed_at"]),
        ]
        constraints = [
            # Cada papel aceita uma revisão uma única vez.
            models.UniqueConstraint(fields=["revision", "role"], name="unique_signature_per_revision_role"),
        ]

    def __str__(self) -> str:
        return f"{self.role} @ {self.signed_at.isoformat()} ({self.document_hash[:12]})"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ImmutableRecordError(
                "Evidências de assinatura são append-only e não podem ser alteradas."
            )
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> NoReturn:
        raise ImmutableRecordError(
            "Evidências de assinatura são append-only e não podem ser removidas."
        )


class ContractSignatureOtps(models.Model):
    """Código de uso único enviado por e-mail antes do aceite.

    Comprova que quem assinou tem posse do endereço de e-mail cadastrado.
    Guardamos apenas o hash do código; o valor em claro só existe no e-mail.
    """

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name="signature_otps")
    role = models.CharField(max_length=20, choices=SignatureRole.choices)
    # O código só vale para quem o pediu, para a revisão que essa parte leu e
    # para o endereço que o recebeu. Nulos só em códigos anteriores a isso.
    signer = models.ForeignKey("users.Users", models.DO_NOTHING, related_name="+", blank=True, null=True)
    revision = models.ForeignKey(
        ContractRevisions, models.DO_NOTHING, related_name="signature_otps", blank=True, null=True,
    )
    email = models.CharField(max_length=255)
    code_hash = models.CharField(max_length=64)
    attempts = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "contract_signature_otps"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["contract", "role", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"OTP {self.role} ({self.email})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_usable(self) -> bool:
        return self.consumed_at is None and not self.is_expired


class ContractAmendments(models.Model):
    """Proposta de troca de datas; só o aceite da contraparte modifica a reserva."""

    id = models.UUIDField(primary_key=True)
    contract = models.ForeignKey(Contracts, models.DO_NOTHING, related_name="amendments")
    proposer = models.ForeignKey("users.Users", models.DO_NOTHING, related_name="+")
    base_revision = models.ForeignKey(ContractRevisions, models.DO_NOTHING, related_name="+")
    original_start = models.DateTimeField()
    original_end = models.DateTimeField()
    proposed_start = models.DateTimeField()
    proposed_end = models.DateTimeField()
    reason = models.CharField(max_length=1000)
    status = models.CharField(max_length=20, choices=AmendmentStatus.choices, default=AmendmentStatus.PENDING)
    decided_by = models.ForeignKey("users.Users", models.DO_NOTHING, related_name="+", null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = "contract_amendments"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["contract"], condition=models.Q(status="pending"), name="one_pending_contract_amendment"),
        ]
