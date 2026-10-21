"""Aditivos sem movimentação financeira: mesma quantidade de diárias e novo aceite."""
from datetime import timedelta
from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from common.exceptions import Conflict
from contracts.enums import AmendmentStatus
from contracts.models import Contracts, ContractAmendments
from contracts.revisions import freeze_revision
from contracts.services import ContractService
from notifications.events import notify_rental_event
from payments.availability import tem_conflito
from postings.models import Postings
from rentals import policy
from rentals.models import Rentals


class AmendmentInputSerializer(serializers.Serializer):
    base_revision = serializers.UUIDField()
    proposed_start = serializers.DateTimeField()
    proposed_end = serializers.DateTimeField()
    reason = serializers.CharField(max_length=1000, allow_blank=False)


class AmendmentOutputSerializer(serializers.ModelSerializer):
    proposer_name = serializers.CharField(source="proposer.name", read_only=True)

    class Meta:
        model = ContractAmendments
        fields = ["id", "contract", "proposer", "proposer_name", "base_revision", "original_start", "original_end",
                  "proposed_start", "proposed_end", "reason", "status", "decided_by", "decided_at", "expires_at", "created_at"]
        read_only_fields = fields


class AmendmentService:
    @staticmethod
    def _lock(reference):
        posting = Postings.objects.select_related("machinery__owner").select_for_update(of=("self", "machinery")).get(pk=reference.rental.postings_id)
        rental = Rentals.objects.select_for_update().select_related("lessee").get(pk=reference.rental_id)
        rental.postings = posting
        contract = Contracts.objects.select_for_update().get(pk=reference.pk)
        contract.rental = rental
        return contract

    @staticmethod
    def _ensure_open(contract):
        rental = contract.rental
        if (rental.status not in ("active", "signed") or contract.status == "cancelled"
                or rental.start_date <= timezone.now() or rental.initial_hour_meter is not None):
            raise Conflict("A troca de datas só é permitida em uma locação paga que ainda não começou.")
        if contract.current_revision_id is None:
            raise Conflict("Este contrato legado não possui revisão para receber um aditivo.")
        if contract.signature_deadline and contract.status != "signed" and contract.signature_deadline <= timezone.now():
            raise Conflict("O prazo de assinatura deste contrato terminou.", code="signature_deadline")
        if not rental.payments.filter(status="approved").exists():
            raise Conflict("A troca de datas exige pagamento confirmado.")

    @staticmethod
    def _validate_dates(contract, start, end):
        rental = contract.rental
        if end < start:
            raise ValidationError({"proposed_end": "O término não pode ser anterior ao início."})
        days = (end.date() - start.date()).days + 1
        current_days = rental.billable_days or (rental.end_date.date() - rental.start_date.date()).days + 1
        if days != current_days:
            raise ValidationError({"proposed_end": "Mantenha a mesma quantidade de diárias. Para prorrogar, faça uma nova reserva."})
        policy.ensure_can_book(rental.lessee, rental.postings)
        policy.ensure_lead_time(start, field="proposed_start")
        posting = rental.postings
        if (posting.status != "active" or posting.machinery.status != "active"
                or (posting.availability_start and start < posting.availability_start)
                or (posting.availability_end and end > posting.availability_end)
                or (posting.max_reservation_days and days > posting.max_reservation_days)):
            raise Conflict("O novo período não atende à disponibilidade do anúncio.")
        if tem_conflito(posting.pk, start, end, ignorar=rental.pk):
            raise Conflict("As novas datas estão ocupadas ou conflitam com o intervalo de limpeza.", code="period_unavailable")

    @staticmethod
    def _expire(contract):
        for amendment in contract.amendments.filter(status="pending", expires_at__lte=timezone.now()):
            amendment.status = AmendmentStatus.EXPIRED
            amendment.decided_at = timezone.now()
            amendment.save(update_fields=["status", "decided_at"])
            notify_rental_event(contract.rental, "amendment_expired", event_key=f"amendment:{amendment.pk}:expired", contract=contract)

    @staticmethod
    @transaction.atomic
    def list(contract_id, *, actor):
        contract = AmendmentService._lock(ContractService.get(contract_id, actor=actor))
        AmendmentService._expire(contract)
        return list(contract.amendments.select_related("proposer").all())

    @staticmethod
    @transaction.atomic
    def propose(contract_id, data, *, actor):
        serializer = AmendmentInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        base_revision_id = values.pop("base_revision")
        contract = AmendmentService._lock(ContractService.get(contract_id, actor=actor))
        AmendmentService._ensure_open(contract)
        if contract.current_revision_id != base_revision_id:
            raise Conflict("O contrato foi atualizado. Revise-o antes de propor outras datas.", code="stale_revision")
        AmendmentService._expire(contract)
        if contract.amendments.filter(status="pending").exists():
            raise Conflict("Já existe uma solicitação de alteração aguardando resposta.")
        start, end = values["proposed_start"], values["proposed_end"]
        if (start, end) == (contract.rental.start_date, contract.rental.end_date):
            raise ValidationError("Escolha um período diferente do atual.")
        AmendmentService._validate_dates(contract, start, end)
        now = timezone.now()
        deadline = min(contract.rental.start_date, start) - timedelta(hours=24)
        if deadline <= now:
            raise Conflict("Não há prazo para confirmar e assinar esta alteração.")
        amendment = ContractAmendments.objects.create(
            id=uuid4(), contract=contract, proposer=actor, base_revision_id=base_revision_id, original_start=contract.rental.start_date,
            original_end=contract.rental.end_date, expires_at=min(deadline, now + timedelta(days=7)), created_at=now, **values,
        )
        notify_rental_event(contract.rental, "amendment_proposed", event_key=f"amendment:{amendment.pk}:proposed", contract=contract)
        return amendment

    @staticmethod
    @transaction.atomic
    def decide(contract_id, amendment_id, action, *, actor):
        contract = AmendmentService._lock(ContractService.get(contract_id, actor=actor))
        amendment = contract.amendments.select_for_update().filter(pk=amendment_id).first()
        if amendment is None:
            raise NotFound("Solicitação não encontrada neste contrato.")
        if (action == "withdraw") != (amendment.proposer_id == actor.pk):
            raise PermissionDenied("Somente quem propôs pode retirar; somente a outra parte pode aceitar ou recusar.")
        target = {"accept": AmendmentStatus.ACCEPTED, "reject": AmendmentStatus.REJECTED, "withdraw": AmendmentStatus.WITHDRAWN}[action]
        if amendment.status == target:
            return amendment  # repetição da mesma decisão não cria outra revisão
        if amendment.status != AmendmentStatus.PENDING or amendment.expires_at <= timezone.now():
            raise Conflict("Esta solicitação não está mais aguardando resposta.", code="amendment_closed")
        AmendmentService._ensure_open(contract)
        if contract.current_revision_id != amendment.base_revision_id:
            raise Conflict("O contrato mudou desde esta proposta. Faça uma nova solicitação.", code="stale_revision")
        if action == "accept":
            # O lock da máquina é o mesmo da reserva avulsa e da recorrência.
            AmendmentService._validate_dates(contract, amendment.proposed_start, amendment.proposed_end)
            rental = contract.rental
            rental.start_date, rental.end_date = amendment.proposed_start, amendment.proposed_end
            rental.status, rental.updated_at = "active", timezone.now()
            rental.save(update_fields=["start_date", "end_date", "status", "updated_at"])
            contract.status = "pending_signatures"
            contract.save(update_fields=["status"])
            freeze_revision(contract, reason="amendment")
        amendment.status, amendment.decided_by, amendment.decided_at = target, actor, timezone.now()
        amendment.save(update_fields=["status", "decided_by", "decided_at"])
        notify_rental_event(contract.rental, f"amendment_{target}", event_key=f"amendment:{amendment.pk}:{target}", contract=contract)
        return amendment
