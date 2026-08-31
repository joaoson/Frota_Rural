import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from authentication.emailing.email import send_contract_signature_otp_email
from contracts import signature_evidence
from contracts.contract_document import build_contract_document
from contracts.models import ContractSignatureOtps, Contracts
from contracts.serializer import ContractSerializer, ContractSignatureSerializer
from users.models import Users


# --- CONTRACTS ---

@api_view(["GET"])
def contracts_list(request):
    qs = Contracts.objects.all().select_related("rental__lessee", "rental__postings__machinery__owner")
    serializer = ContractSerializer(qs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


def _get_contract(pk):
    """Aceita tanto o id do contrato quanto o id do aluguel."""
    return (
        Contracts.objects.filter(Q(pk=pk) | Q(rental_id=pk))
        .select_related("rental__lessee", "rental__postings__machinery__owner")
        .first()
    )


def _party_for_role(contract, role):
    """Usuário que a plataforma espera como signatário daquele papel."""
    if role == "locatario":
        return contract.rental.lessee
    return contract.rental.postings.machinery.owner


def _signature_block(signatures):
    """Datas de assinatura exibidas no contrato, vindas da evidência gravada."""
    datas = {"locador": "—", "locatario": "—"}
    for signature in signatures:
        if signature.role in datas:
            datas[signature.role] = timezone.localtime(signature.signed_at).strftime("%d/%m/%Y às %H:%M")
    return {"data_locador": datas["locador"], "data_locatario": datas["locatario"]}


def _evidence_block(signatures):
    """Resumo público da evidência de cada aceite.

    O IP e o User-Agent completos ficam no registro auditável
    (``contracts/<id>/evidence``); aqui vai o suficiente para a parte conferir
    que assinou aquele documento e não outro.
    """
    return [
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
    ]


@api_view(["GET"])
def contract_detail(request, pk):
    contract = _get_contract(pk)
    if not contract:
        return Response(status=status.HTTP_404_NOT_FOUND)

    document = build_contract_document(contract)
    signatures = list(contract.signatures.all())

    # O hash é do documento (os termos). O bloco de assinatura é anexado só
    # depois, porque ele muda a cada aceite e não faz parte do que se aceita.
    response_data = dict(document)
    response_data["assinatura"] = _signature_block(signatures)
    response_data["evidencia"] = {
        "hash_documento_atual": signature_evidence.document_hash(document),
        "algoritmo_hash": signature_evidence.HASH_ALGORITHM,
        "assinaturas": _evidence_block(signatures),
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(["GET"])
def contract_evidence(request, pk):
    """Trilha de auditoria completa do aceite eletrônico.

    Reúne o que a MP 2.200-2/2001 e a Lei 14.063/2020 exigem que se demonstre:
    qual documento foi aceito (hash + versão), por quem, quando, de onde — e a
    conferência do encadeamento que atesta que nada foi alterado depois.
    """
    contract = _get_contract(pk)
    if not contract:
        return Response(status=status.HTTP_404_NOT_FOUND)

    document = build_contract_document(contract)
    intact, problems = signature_evidence.verify_chain(contract, document)

    return Response(
        {
            "contrato_id": str(contract.id),
            "aluguel_id": str(contract.rental_id),
            "status": contract.status,
            "documento": {
                "versao": document["contrato"]["versao_documento"],
                "hash": signature_evidence.document_hash(document),
                "algoritmo": signature_evidence.HASH_ALGORITHM,
            },
            "cadeia_integra": intact,
            "inconsistencias": problems,
            "assinaturas": ContractSignatureSerializer(
                contract.signatures.all(), many=True
            ).data,
            "fundamento_legal": (
                "Assinatura eletrônica simples, com validade entre as partes nos termos "
                "da MP nº 2.200-2/2001, art. 10, §2º, e da Lei nº 14.063/2020, art. 4º, I."
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def request_signature_otp(request, pk):
    """Envia por e-mail um código de uso único a ser informado no aceite.

    Prova de posse do endereço cadastrado. Exigido no aceite por padrão
    (``CONTRACT_SIGNATURE_REQUIRE_OTP``), então esta etapa antecede a assinatura.
    """
    contract = _get_contract(pk)
    if not contract:
        return Response(status=status.HTTP_404_NOT_FOUND)

    role = request.data.get("role")
    if role not in ("locador", "locatario"):
        return Response(
            {"error": "Informe o papel de quem vai assinar: 'locador' ou 'locatario'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    party = _party_for_role(contract, role)

    # Sem esta conferência, uma parte poderia pedir códigos no lugar da outra:
    # como `_consume_otp` só considera o código mais recente, cada pedido
    # invalidaria o anterior e travaria a assinatura de quem é de direito.
    request_user = getattr(request, "user", None)
    if isinstance(request_user, Users) and request_user.pk:
        if party is not None and request_user.pk != party.pk:
            return Response(
                {"error": "Você não é a parte responsável por assinar neste papel."},
                status=status.HTTP_403_FORBIDDEN,
            )

    email = getattr(party, "email", "") or ""
    if not email:
        return Response(
            {"error": "A parte não possui e-mail cadastrado para receber o código."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    code = signature_evidence.generate_otp_code()
    ContractSignatureOtps.objects.create(
        id=uuid.uuid4(),
        contract=contract,
        role=role,
        email=email,
        code_hash=signature_evidence.hash_otp_code(code, contract.id),
        expires_at=now + timedelta(seconds=signature_evidence.OTP_TTL_SECONDS),
        created_at=now,
    )

    try:
        send_contract_signature_otp_email(
            to_email=email,
            code=code,
            contract_number=f"#CTR-{str(contract.rental_id)[:4].upper()}",
            timeout=round(signature_evidence.OTP_TTL_SECONDS / 60),
        )
    except Exception:
        return Response(
            {"error": "Não foi possível enviar o código por e-mail. Tente novamente."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # O e-mail volta mascarado só para a parte confirmar onde procurar o código.
    local, _, domain = email.partition("@")
    masked = f"{local[:2]}{'*' * max(len(local) - 2, 1)}@{domain}"
    return Response(
        {
            "sent_to": masked,
            "expires_in_seconds": signature_evidence.OTP_TTL_SECONDS,
        },
        status=status.HTTP_200_OK,
    )


def _consume_otp(contract, role, code):
    """Valida o código informado. Devolve (ok, mensagem de erro)."""
    if not code:
        return False, "Informe o código enviado para o seu e-mail."

    otp = (
        ContractSignatureOtps.objects.filter(contract=contract, role=role, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not otp:
        return False, "Nenhum código pendente. Solicite um novo código."
    if otp.is_expired:
        return False, "O código expirou. Solicite um novo código."
    if otp.attempts >= signature_evidence.OTP_MAX_ATTEMPTS:
        return False, "Número de tentativas excedido. Solicite um novo código."

    otp.attempts += 1
    if otp.code_hash != signature_evidence.hash_otp_code(str(code).strip(), contract.id):
        otp.save(update_fields=["attempts"])
        return False, "Código inválido."

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["attempts", "consumed_at"])
    return True, ""


@api_view(["POST"])
def sign_contract(request, pk):
    """Registra o aceite de uma parte junto de toda a evidência do momento."""
    contract = _get_contract(pk)
    if not contract:
        return Response(status=status.HTTP_404_NOT_FOUND)

    role = request.data.get("role")
    if role not in ("locador", "locatario"):
        return Response(
            {"error": "Informe o papel de quem está assinando: 'locador' ou 'locatario'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ja_assinou = contract.accepted_by_lessee if role == "locatario" else contract.accepted_by_lessor
    if ja_assinou:
        return Response(
            {"error": "Esta parte já assinou o contrato."},
            status=status.HTTP_409_CONFLICT,
        )


    # Quem a plataforma espera naquele papel. A conferência vem antes do OTP:
    # do contrário uma parte errada queimaria o código enviado à parte certa.
    party = _party_for_role(contract, role)

    signer = party
    request_user = getattr(request, "user", None)
    if isinstance(request_user, Users) and request_user.pk:
        if party is not None and request_user.pk != party.pk:
            return Response(
                {"error": "Você não é a parte responsável por assinar neste papel."},
                status=status.HTTP_403_FORBIDDEN,
            )
        signer = request_user

    otp_informado = request.data.get("otp")
    otp_obrigatorio = getattr(settings, "CONTRACT_SIGNATURE_REQUIRE_OTP", False)
    otp_verified = False
    if otp_obrigatorio or otp_informado:
        ok, error = _consume_otp(contract, role, otp_informado)
        if not ok:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        otp_verified = True

    # O hash é calculado sobre o documento exatamente como ele é servido em
    # contracts/<id> — é esse conteúdo que a parte leu e aceitou.
    document = build_contract_document(contract)

    try:
        signature = signature_evidence.record_signature(
            contract=contract,
            document=document,
            role=role,
            signer=signer,
            signer_name=(request.data.get("name") or "").strip(),
            signer_email=getattr(signer, "email", "") or "",
            request=request,
            otp_verified=otp_verified,
        )
    except IntegrityError:
        return Response(
            {"error": "Não foi possível registrar a assinatura. Tente novamente."},
            status=status.HTTP_409_CONFLICT,
        )

    if role == "locatario":
        contract.accepted_by_lessee = True
    else:
        contract.accepted_by_lessor = True

    if contract.accepted_by_lessee and contract.accepted_by_lessor:
        contract.status = "signed"
        contract.rental.status = "signed"
    else:
        contract.status = "pending_signatures"
        contract.rental.status = "active"

    contract.rental.save()
    contract.save()

    payload = ContractSerializer(contract).data
    payload["signature_evidence"] = ContractSignatureSerializer(signature).data
    return Response(payload, status=status.HTTP_200_OK)


# Keep compatibility with previous new backend view naming:
get_contracts = contracts_list
