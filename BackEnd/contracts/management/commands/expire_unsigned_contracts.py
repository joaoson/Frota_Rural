import logging

from django.core.management.base import BaseCommand
from django.utils import timezone
from rest_framework.exceptions import APIException

from contracts.models import Contracts
from payments.refunds import RefundService
from rentals.cancellation import CancellationService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Cancela contratos não assinados até 24 h antes do início e solicita estorno integral. Pode ser repetido."

    def handle(self, *args, **options):
        cancelled, skipped = 0, []
        for contract in Contracts.objects.filter(status="pending_signatures", signature_deadline__lte=timezone.now(),
                                                  rental__status__in=("active", "signed")).select_related("rental"):
            # One contract that cannot be cancelled yet (payment in review, checkout
            # still confirming) must not stop the others; it is retried next run.
            try:
                refund_ids = CancellationService._cancel(contract.rental, deadline=True,
                                                         reason="Prazo de assinatura encerrado.")
            except APIException as exc:
                skipped.append(contract.pk)
                logger.warning("Contrato %s não cancelado no prazo: %s", contract.pk, exc)
                self.stdout.write(f"Não cancelado agora (será tentado de novo): {contract.pk} — {exc}")
                continue
            for refund_id in refund_ids:
                RefundService.process(refund_id)
            cancelled += 1
        self.stdout.write(f"Contratos verificados para cancelamento: {cancelled} · pendentes: {len(skipped)}")
