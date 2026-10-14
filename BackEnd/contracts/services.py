import hmac
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from authentication.emailing.email import send_contract_signature_otp_email
from common.exceptions import BadGateway, Conflict
from contracts import signature_evidence
from contracts.contract_document import build_contract_document
from contracts.enums import ContractStatus, SignatureRole
from contracts.models import Contracts, ContractSignatureOtps, ContractSignatures
from contracts.serializer import ContractOtpRequestInputSerializer, ContractSignInputSerializer
from rentals.enums import RentalStatus
from rentals.models import Rentals
from users.models import Users
from postings.models import Postings
from payments.availability import tem_conflito
from notifications.events import notify_rental_event

LEGAL_BASIS = (
    "Assinatura eletrônica simples, com validade entre as partes nos termos "
    "da MP nº 2.200-2/2001, art. 10, §2º, e da Lei nº 14.063/2020, art. 4º, I."
)


@dataclass(frozen=True)
class OtpDispatch:
    sent_to: str
    expires_in_seconds: int


@dataclass(frozen=True)
class SignatureResult:
    contract: Contracts
    signature: ContractSignatures


class ContractService:
    @staticmethod
    def _queryset(actor: Users | None = None) -> QuerySet[Contracts]:
        queryset = Contracts.objects.all()
        if actor is not None:
            queryset = queryset.filter(Q(rental__lessee=actor) | Q(rental__postings__machinery__owner=actor))
        return queryset.select_related(
            "rental__lessee", "rental__postings__machinery__owner"
        )

    @staticmethod
    def get(contract_id: UUID, *, actor: Users) -> Contracts:
        """Aceita tanto o id do contrato quanto o id da locação associada."""
        contract = (
            ContractService._queryset(actor).filter(Q(pk=contract_id) | Q(rental_id=contract_id)).first()
        )
        if contract is None:
            raise NotFound("Contrato não encontrado.")
        return contract

    @staticmethod
    @transaction.atomic
    def create_for_rental(rental: Rentals) -> Contracts:
        """Contrato nasce junto da locação, aguardando o aceite das duas partes."""
        return Contracts.objects.create(
            id=uuid.uuid4(),
            rental=rental,
            accepted_by_lessor=False,
            accepted_by_lessee=False,
            status=ContractStatus.PENDING_SIGNATURES,
            created_at=timezone.now(),
        )

    @staticmethod
    def party_for_role(contract: Contracts, role: str) -> Users:
        """Usuário que a plataforma espera como signatário daquele papel."""
        if role == SignatureRole.LESSEE:
            return contract.rental.lessee
        return contract.rental.postings.machinery.owner

    @staticmethod
    def get_document(contract_id: UUID, *, actor: Users) -> dict[str, Any]:
        contract = ContractService.get(contract_id, actor=actor)
        document = build_contract_document(contract)
        signatures = [*contract.signatures.all()]

        # O hash é do documento (os termos). O bloco de assinatura é anexado só
        # depois, porque ele muda a cada aceite e não faz parte do que se aceita.
        return {
            **document,
            "assinatura": ContractService._signature_dates(signatures),
            "evidencia": {
                "hash_documento_atual": signature_evidence.document_hash(document),
                "algoritmo_hash": signature_evidence.HASH_ALGORITHM,
                "assinaturas": ContractService._signature_summaries(signatures),
            },
        }

    @staticmethod
    def get_evidence(contract_id: UUID, *, actor: Users) -> dict[str, Any]:
        """Trilha de auditoria completa do aceite eletrônico.

        Reúne o que a MP 2.200-2/2001 e a Lei 14.063/2020 exigem que se demonstre:
        qual documento foi aceito (hash + versão), por quem, quando, de onde — e a
        conferência do encadeamento que atesta que nada foi alterado depois.
        """
        contract = ContractService.get(contract_id, actor=actor)
        document = build_contract_document(contract)
        intact, problems = signature_evidence.verify_chain(contract, document)
        return {
            "contrato_id": contract.id,
            "aluguel_id": contract.rental_id,
            "status": contract.status,
            "documento": {
                "versao": document["contrato"]["versao_documento"],
                "hash": signature_evidence.document_hash(document),
                "algoritmo": signature_evidence.HASH_ALGORITHM,
            },
            "cadeia_integra": intact,
            "inconsistencias": problems,
            "assinaturas": contract.signatures.all(),
            "fundamento_legal": LEGAL_BASIS,
        }

    @staticmethod
    def _signature_dates(signatures: Iterable[ContractSignatures]) -> dict[str, str]:
        """Datas de assinatura exibidas no contrato, vindas da evidência gravada."""
        dates = {SignatureRole.LESSOR.value: "—", SignatureRole.LESSEE.value: "—"}
        for signature in signatures:
            if signature.role in dates:
                dates[signature.role] = timezone.localtime(signature.signed_at).strftime(
                    "%d/%m/%Y às %H:%M"
                )
        return {
            "data_locador": dates[SignatureRole.LESSOR],
            "data_locatario": dates[SignatureRole.LESSEE],
        }

    @staticmethod
    def _signature_summaries(
        signatures: Iterable[ContractSignatures],
    ) -> tuple[dict[str, Any], ...]:
        """Resumo público da evidência de cada aceite.

        O IP e o User-Agent completos ficam no registro auditável
        (``contracts/<id>/evidence``); aqui vai o suficiente para a parte conferir
        que assinou aquele documento e não outro.
        """
        return tuple(
            {
                "papel": signature.role,
                "nome": signature.signer_name,
                "email": signature.signer_email,
                "assinado_em_utc": signature.signed_at.isoformat(),
                "hash_documento": signature.document_hash,
                "algoritmo_hash": signature.hash_algorithm,
                "versao_documento": signature.document_version,
                "ip": signature.ip_address,
                "otp_verificado": signature.otp_verified,
                "hash_registro": signature.record_hash,
            }
            for signature in signatures
        )

    # `list` fica por último: dentro do corpo da classe o nome passa a apontar
    # para este método, e anotações escritas depois dele não enxergariam o
    # `list` embutido.
    @staticmethod
    def list(*, actor: Users) -> QuerySet[Contracts]:
        return ContractService._queryset(actor).order_by("-created_at", "-id")


class ContractSignatureService:
    @staticmethod
    @transaction.atomic
    def request_otp(
        contract_id: UUID, data: Mapping[str, Any], *, requester: Users
    ) -> OtpDispatch:
        """Envia por e-mail um código de uso único a ser informado no aceite.

        Prova de posse do endereço cadastrado. Exigido no aceite por padrão
        (``CONTRACT_SIGNATURE_REQUIRE_OTP``), então esta etapa antecede a assinatura.
        Se o e-mail não sai, o código gravado é desfeito junto: um código que
        ninguém recebeu invalidaria o anterior, que ainda é o válido.
        """
        contract = ContractService.get(contract_id, actor=requester)
        serializer = ContractOtpRequestInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        role: str = serializer.validated_data["role"]

        party = ContractService.party_for_role(contract, role)
        # Sem esta conferência, uma parte poderia pedir códigos no lugar da outra:
        # como só o código mais recente vale, cada pedido invalidaria o anterior
        # e travaria a assinatura de quem é de direito.
        ContractSignatureService._ensure_requester_is_party(requester, party)

        if not party.email:
            raise ValidationError("A parte não possui e-mail cadastrado para receber o código.")

        now = timezone.now()
        code = signature_evidence.generate_otp_code()
        ContractSignatureOtps.objects.create(
            id=uuid.uuid4(),
            contract=contract,
            role=role,
            email=party.email,
            code_hash=signature_evidence.hash_otp_code(code, contract.id),
            expires_at=now + timedelta(seconds=signature_evidence.OTP_TTL_SECONDS),
            created_at=now,
        )

        try:
            send_contract_signature_otp_email(
                to_email=party.email,
                code=code,
                contract_number=str(contract),
                timeout=round(signature_evidence.OTP_TTL_SECONDS / 60),
            )
        except Exception as exc:
            raise BadGateway(
                "Não foi possível enviar o código por e-mail. Tente novamente."
            ) from exc

        return OtpDispatch(
            sent_to=ContractSignatureService._mask_email(party.email),
            expires_in_seconds=signature_evidence.OTP_TTL_SECONDS,
        )

    @staticmethod
    def sign(
        contract_id: UUID,
        data: Mapping[str, Any],
        *,
        requester: Users,
        ip_address: str,
        user_agent: str,
    ) -> SignatureResult:
        """Registra o aceite de uma parte junto de toda a evidência do momento.

        Não é um único bloco atômico de propósito: a conferência do OTP grava a
        tentativa em transação própria, para que um código errado conte contra o
        limite de tentativas mesmo com o aceite recusado. O aceite em si
        (`_record_acceptance`) é atômico.
        """
        contract = ContractService.get(contract_id, actor=requester)
        serializer = ContractSignInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated: dict[str, Any] = serializer.validated_data
        role: str = validated["role"]

        ContractSignatureService._ensure_not_signed(contract, role)
        ContractSignatureService._ensure_payable(contract.rental)

        # Quem a plataforma espera naquele papel. A conferência vem antes do OTP:
        # do contrário uma parte errada queimaria o código enviado à parte certa.
        party = ContractService.party_for_role(contract, role)
        ContractSignatureService._ensure_requester_is_party(requester, party)
        signer = requester or party

        otp: str | None = validated.get("otp")
        otp_verified = False
        if settings.CONTRACT_SIGNATURE_REQUIRE_OTP or otp:
            ContractSignatureService._consume_otp(contract, role, otp)
            otp_verified = True

        return ContractSignatureService._record_acceptance(
            contract,
            role=role,
            signer=signer,
            signer_name=validated["name"].strip(),
            otp_verified=otp_verified,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    @staticmethod
    @transaction.atomic
    def _record_acceptance(
        contract: Contracts,
        *,
        role: str,
        signer: Users,
        signer_name: str,
        otp_verified: bool,
        ip_address: str,
        user_agent: str,
    ) -> SignatureResult:
        # Match the reservation/payment lock order, then serialize both signatures.
        posting = Postings.objects.select_related("machinery__owner").select_for_update(
            of=("self", "machinery")
        ).get(pk=contract.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=contract.rental_id)
        rental.postings = posting
        locked = Contracts.objects.select_for_update().get(pk=contract.pk)
        locked.rental = rental
        ContractSignatureService._ensure_not_signed(locked, role)
        ContractSignatureService._ensure_payable(rental)

        # O hash é calculado sobre o documento exatamente como ele é servido em
        # contracts/<id> — é esse conteúdo que a parte leu e aceitou.
        document = build_contract_document(locked)
        try:
            signature = signature_evidence.record_signature(
                contract=locked,
                document=document,
                role=role,
                signer=signer,
                signer_name=signer_name,
                signer_email=signer.email or "",
                ip_address=ip_address,
                user_agent=user_agent,
                otp_verified=otp_verified,
            )
        except IntegrityError as exc:
            raise Conflict(
                "Não foi possível registrar a assinatura. Tente novamente.",
                code="signature_conflict",
            ) from exc

        if role == SignatureRole.LESSEE:
            locked.accepted_by_lessee = True
        else:
            locked.accepted_by_lessor = True

        rental = locked.rental
        if locked.accepted_by_lessee and locked.accepted_by_lessor:
            locked.status = ContractStatus.SIGNED
            rental.status = RentalStatus.SIGNED
        else:
            locked.status = ContractStatus.PENDING_SIGNATURES
            rental.status = RentalStatus.ACTIVE

        rental.save(update_fields=["status"])
        locked.save(update_fields=["accepted_by_lessor", "accepted_by_lessee", "status"])
        notify_rental_event(rental, f"contract_signed_{role}",
                            event_key=f"contract:{locked.pk}:signed:{role}", contract=locked)
        if locked.status == ContractStatus.SIGNED:
            notify_rental_event(rental, "contract_completed",
                                event_key=f"contract:{locked.pk}:completed", contract=locked)
        return SignatureResult(contract=locked, signature=signature)

    @staticmethod
    def _consume_otp(contract: Contracts, role: str, code: str | None) -> None:
        """Valida e consome o código informado; `ValidationError` se não servir."""
        if not code:
            raise ValidationError("Informe o código enviado para o seu e-mail.")

        error: str | None = None
        with transaction.atomic():
            otp = (
                ContractSignatureOtps.objects.select_for_update()
                .filter(contract=contract, role=role, consumed_at__isnull=True)
                .order_by("-created_at")
                .first()
            )
            if otp is None:
                error = "Nenhum código pendente. Solicite um novo código."
            elif otp.is_expired:
                error = "O código expirou. Solicite um novo código."
            elif otp.attempts >= signature_evidence.OTP_MAX_ATTEMPTS:
                error = "Número de tentativas excedido. Solicite um novo código."
            else:
                otp.attempts += 1
                expected = signature_evidence.hash_otp_code(code.strip(), contract.id)
                if hmac.compare_digest(otp.code_hash, expected):
                    otp.consumed_at = timezone.now()
                    otp.save(update_fields=["attempts", "consumed_at"])
                else:
                    otp.save(update_fields=["attempts"])
                    error = "Código inválido."

        # Levantado só depois do bloco atômico: a tentativa errada já foi gravada.
        if error is not None:
            raise ValidationError(error)

    @staticmethod
    def _ensure_payable(rental: Rentals) -> None:
        if rental.status not in (RentalStatus.ACTIVE, RentalStatus.SIGNED) or not rental.payments.filter(status="approved").exists():
            raise Conflict("Confirme o pagamento desta reserva antes de assinar o contrato.")
        if tem_conflito(rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.pk):
            raise Conflict("As datas desta reserva não estão mais disponíveis.")

    @staticmethod
    def _ensure_not_signed(contract: Contracts, role: str) -> None:
        signed = (
            contract.accepted_by_lessee
            if role == SignatureRole.LESSEE
            else contract.accepted_by_lessor
        )
        if signed:
            raise Conflict("Esta parte já assinou o contrato.", code="already_signed")

    @staticmethod
    def _ensure_requester_is_party(requester: Users, party: Users) -> None:
        if requester is not None and requester.pk != party.pk:
            raise PermissionDenied("Você não é a parte responsável por assinar neste papel.")

    @staticmethod
    def _mask_email(email: str) -> str:
        """O e-mail volta mascarado só para a parte confirmar onde procurar o código."""
        local, _, domain = email.partition("@")
        return f"{local[:2]}{'*' * max(len(local) - 2, 1)}@{domain}"
