"""Revisões congeladas do contrato: o documento exato que as duas partes aceitam."""

from copy import deepcopy
import json
import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from contracts import signature_evidence, contract_template
from contracts.contract_document import build_contract_document
from contracts.enums import ContractStatus, RevisionReason
from contracts.models import Contracts, ContractRevisions
from rentals import lifecycle


def freeze_revision(contract: Contracts, *, reason: str = RevisionReason.INITIAL) -> ContractRevisions:
    """Congela o documento atual como nova revisão. Quem chama segura o lock do contrato."""
    # Normaliza pelo mesmo JSON do hash: o que volta do banco gera o mesmo hash.
    if reason == RevisionReason.AMENDMENT and contract.current_revision_id:
        # O aditivo muda o período, sem incorporar edições de perfil, anúncio ou preço.
        document = deepcopy(contract.current_revision.document)
        document["contrato"].update(
            data_inicio=contract.rental.start_date.strftime("%Y-%m-%d"),
            data_fim=contract.rental.end_date.strftime("%Y-%m-%d"),
            versao_documento=contract_template.TEMPLATE_VERSION,
        )
        document["clausulas"] = contract_template.render_clausulas(document)
    else:
        document = build_contract_document(contract)
    document = json.loads(signature_evidence.canonical_document(document))
    last = contract.revisions.aggregate(last=Max("number"))["last"] or 0
    revision = ContractRevisions.objects.create(
        id=uuid.uuid4(),
        contract=contract,
        number=last + 1,
        document=document,
        document_hash=signature_evidence.document_hash(document),
        document_version=document["contrato"]["versao_documento"],
        reason=reason,
        created_at=timezone.now(),
    )
    # A new revision needs both acceptances again; signatures of an older one stay as history.
    contract.signature_deadline = contract.rental.start_date - timedelta(hours=24)
    contract.current_revision = revision
    contract.accepted_by_lessee = False
    contract.accepted_by_lessor = False
    contract.save(update_fields=["current_revision", "accepted_by_lessee", "accepted_by_lessor", "signature_deadline"])
    return revision


def _is_paid(contract: Contracts) -> bool:
    rental = contract.rental
    return (contract.status == ContractStatus.PENDING_SIGNATURES
            and rental.status in lifecycle.PAID
            and rental.payments.filter(status="approved").exists())


def freeze_initial_revision(contract: Contracts) -> ContractRevisions | None:
    """Revisão 1 no momento do pagamento, se o contrato ainda não tiver uma.

    Contratos legados, com aceite gravado antes das revisões, continuam sem
    revisão: congelar agora mudaria o documento sob uma assinatura já feita.
    """
    if contract.current_revision_id is not None or contract.signatures.exists():
        return None
    return freeze_revision(contract)


@transaction.atomic
def ensure_current_revision(contract: Contracts) -> ContractRevisions | None:
    """Revisão vigente; congela a inicial de contratos pagos antes desta versão.

    Devolve None enquanto o contrato não foi pago (o documento é só prévia) e
    nos contratos legados.
    """
    if contract.current_revision_id is not None:
        return contract.current_revision
    if not _is_paid(contract):
        return None
    locked = Contracts.objects.select_for_update().get(pk=contract.pk)
    locked.rental = contract.rental
    revision = locked.current_revision if locked.current_revision_id else freeze_initial_revision(locked)
    contract.current_revision = revision
    contract.signature_deadline = locked.signature_deadline
    return revision
