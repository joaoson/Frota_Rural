from django.core.management.base import BaseCommand
from django.utils import timezone

from contracts.models import Contracts
from payments.refunds import RefundService
from rentals.cancellation import CancellationService


class Command(BaseCommand):
    help = "Cancela contratos não assinados até 24 h antes do início e solicita estorno integral. Pode ser repetido."

    def handle(self, *args, **options):
        count = 0
        for contract in Contracts.objects.filter(status="pending_signatures", signature_deadline__lte=timezone.now(),
                                                  rental__status__in=("active", "signed")).select_related("rental"):
            refund_ids = CancellationService._cancel(contract.rental, deadline=True, reason="Prazo de assinatura encerrado.")
            for refund_id in refund_ids:
                RefundService.process(refund_id)
            count += 1
        self.stdout.write(f"Contratos verificados para cancelamento: {count}")
