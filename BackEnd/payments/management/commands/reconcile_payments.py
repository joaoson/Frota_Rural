from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError

from common.exceptions import ServiceUnavailable

from payments.reconcile import reconcile_payments


class Command(BaseCommand):
    help = (
        "Concilia pagamentos com o Stripe: repete tentativas cuja resposta se perdeu (mesma chave de "
        "idempotência), fecha sessões cujo webhook não chegou e lista pagamentos em revisão."
    )

    def add_arguments(self, parser):
        parser.add_argument("--grace-minutes", type=int, default=2,
                            help="Ignora registros alterados há menos que isto (padrão: 2).")

    def handle(self, *args, **options):
        try:
            report = reconcile_payments(grace=timedelta(minutes=options["grace_minutes"]))
        except ServiceUnavailable as exc:
            raise CommandError(str(exc.detail)) from exc
        self.stdout.write(
            f"Sessões ligadas: {report.attached} · tentativas recusadas: {report.failed} · "
            f"ainda incertas: {report.uncertain} · expiradas: {report.expired} · aprovadas: {report.approved} · estornos verificados: {report.refunds_checked}"
        )
        for payment_id in report.requires_review:
            self.stdout.write(f"Em revisão (resolver com o suporte): {payment_id}")
