import hashlib
import hmac
import ipaddress
import json
import secrets
import uuid
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from contracts.models import Contracts, ContractRevisions, ContractSignatures
from users.models import Users

HASH_ALGORITHM = "sha256"

# Marca o início da cadeia de evidências de um contrato.
GENESIS_HASH = "0" * 64


# --- Canonicalização e hash do documento ---


def canonical_document(document: Mapping[str, Any]) -> str:
    """JSON determinístico: mesmas chaves e valores produzem sempre os mesmos bytes."""
    return json.dumps(
        document,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )


def document_hash(document: Mapping[str, Any]) -> str:
    """SHA-256 (hexadecimal) do documento exato que foi apresentado à parte."""
    return hashlib.sha256(canonical_document(document).encode()).hexdigest()


# --- Metadados da requisição ---


def _is_trusted_proxy(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    for network in settings.CONTRACT_TRUSTED_PROXIES:
        try:
            if ip in ipaddress.ip_network(network, strict=False):
                return True
        except ValueError:
            continue
    return False


def client_ip(request: HttpRequest) -> str:
    """IP de origem gravado na evidência.

    `X-Forwarded-For` é texto que qualquer cliente pode enviar. Ele só vale quando
    a conexão vem de um proxy configurado em `CONTRACT_TRUSTED_PROXIES`, que
    acrescenta o IP de quem o chamou ao fim da lista. Lendo de trás para frente, o
    primeiro endereço que não é um desses proxies é o cliente; o que vier antes
    pode ter sido forjado e é ignorado.
    """
    remote = str(request.META.get("REMOTE_ADDR") or "")
    if not _is_trusted_proxy(remote):
        return remote
    hops = [hop.strip() for hop in str(request.META.get("HTTP_X_FORWARDED_FOR", "")).split(",") if hop.strip()]
    for hop in reversed(hops):
        if not _is_trusted_proxy(hop):
            return hop
    return hops[0] if hops else remote


def client_user_agent(request: HttpRequest) -> str:
    # Truncado para não estourar a coluna com um header malicioso.
    return str(request.META.get("HTTP_USER_AGENT") or "")[:1024]


# --- Encadeamento imutável ---


def record_fingerprint(
    *,
    contract_id: UUID,
    role: str,
    signer_id: UUID | None,
    signer_email: str,
    signer_name: str,
    doc_hash: str,
    document_version: str,
    signed_at: datetime,
    ip_address: str,
    user_agent: str,
    otp_verified: bool,
    previous_hash: str,
) -> str:
    """Hash que sela o registro inteiro, incluindo o hash do registro anterior.

    É esse encadeamento que transforma a tabela em um log verificável: para
    forjar um aceite é preciso recalcular todos os registros seguintes, e a
    verificação (``verify_chain``) detecta qualquer divergência.
    """
    payload = canonical_document(
        {
            "contract_id": str(contract_id),
            "role": role,
            "signer_id": str(signer_id) if signer_id else "",
            "signer_email": signer_email,
            "signer_name": signer_name,
            "document_hash": doc_hash,
            "document_version": document_version,
            "signed_at": signed_at.isoformat(),
            "ip_address": ip_address,
            "user_agent": user_agent,
            "otp_verified": bool(otp_verified),
            "previous_hash": previous_hash,
        }
    )
    return hashlib.sha256(payload.encode()).hexdigest()


@transaction.atomic
def record_signature(
    *,
    contract: Contracts,
    document: Mapping[str, Any],
    role: str,
    revision: ContractRevisions | None = None,
    signer: Users | None = None,
    signer_name: str = "",
    signer_email: str = "",
    ip_address: str = "",
    user_agent: str = "",
    otp_verified: bool = False,
) -> ContractSignatures:
    """Grava o aceite encadeado ao registro anterior do mesmo contrato."""
    signed_at = timezone.now()
    doc_hash = document_hash(document)
    version = str(document.get("contrato", {}).get("versao_documento", ""))

    previous = (
        ContractSignatures.objects.select_for_update()
        .filter(contract=contract)
        .order_by("-signed_at", "-id")
        .first()
    )
    previous_hash = previous.record_hash if previous else GENESIS_HASH

    signer_id = signer.id if signer else None
    signer_email = signer_email or (signer.email if signer else "") or ""
    signer_name = signer_name or (signer.name if signer else "") or ""

    return ContractSignatures.objects.create(
        id=uuid.uuid4(),
        contract=contract,
        revision=revision,
        signer=signer,
        signer_name=signer_name,
        signer_email=signer_email,
        role=role,
        document_version=version,
        document_hash=doc_hash,
        hash_algorithm=HASH_ALGORITHM,
        signed_at=signed_at,
        ip_address=ip_address,
        user_agent=user_agent,
        otp_verified=bool(otp_verified),
        previous_hash=previous_hash,
        record_hash=record_fingerprint(
            contract_id=contract.id,
            role=role,
            signer_id=signer_id,
            signer_email=signer_email,
            signer_name=signer_name,
            doc_hash=doc_hash,
            document_version=version,
            signed_at=signed_at,
            ip_address=ip_address,
            user_agent=user_agent,
            otp_verified=otp_verified,
            previous_hash=previous_hash,
        ),
    )


def verify_chain(
    contract: Contracts, document: Mapping[str, Any] | None = None
) -> tuple[bool, list[str]]:
    """Confere o encadeamento e que cada aceite corresponde ao documento assinado.

    Um aceite com revisão é conferido contra a própria revisão congelada. Um
    aceite legado, anterior às revisões, contra `document` (o documento 1.0.0
    reconstruído), se ele vier.
    """
    problems: list[str] = []
    expected_previous = GENESIS_HASH
    current_hash = document_hash(document) if document is not None else None

    signatures = (
        ContractSignatures.objects.filter(contract=contract)
        .select_related("revision")
        .order_by("signed_at", "id")
    )
    for signature in signatures:
        if signature.previous_hash != expected_previous:
            problems.append(
                f"Registro {signature.id}: encadeamento rompido "
                f"(esperado {expected_previous}, gravado {signature.previous_hash})."
            )

        recomputed = record_fingerprint(
            contract_id=signature.contract_id,
            role=signature.role,
            signer_id=signature.signer_id,
            signer_email=signature.signer_email,
            signer_name=signature.signer_name,
            doc_hash=signature.document_hash,
            document_version=signature.document_version,
            signed_at=signature.signed_at,
            ip_address=signature.ip_address,
            user_agent=signature.user_agent,
            otp_verified=signature.otp_verified,
            previous_hash=signature.previous_hash,
        )
        if not hmac.compare_digest(recomputed, signature.record_hash):
            problems.append(f"Registro {signature.id}: conteúdo alterado após a gravação.")

        revision = signature.revision
        if revision is not None:
            if document_hash(revision.document) != revision.document_hash:
                problems.append(f"Revisão {revision.number}: documento alterado após o congelamento.")
            if signature.document_hash != revision.document_hash:
                problems.append(
                    f"Registro {signature.id}: o hash aceito não corresponde à revisão {revision.number}."
                )
        elif current_hash and signature.document_hash != current_hash:
            problems.append(
                f"Registro {signature.id}: o documento atual não corresponde ao que foi assinado."
            )

        expected_previous = signature.record_hash

    return (not problems), problems


# --- OTP por e-mail (prova de posse do endereço) ---

OTP_LENGTH = 6
OTP_TTL_SECONDS: int = getattr(settings, "CONTRACT_OTP_TTL_SECONDS", 10 * 60)
OTP_MAX_ATTEMPTS: int = getattr(settings, "CONTRACT_OTP_MAX_ATTEMPTS", 5)


def generate_otp_code() -> str:
    """Código numérico de 6 dígitos, sorteado com um gerador criptográfico."""
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def hash_otp_code(code: str, contract_id: UUID) -> str:
    """Hash do código salgado com o contrato: o mesmo código não serve em outro contrato."""
    salted = f"{contract_id}:{code}".encode()
    return hashlib.sha256(salted).hexdigest()
