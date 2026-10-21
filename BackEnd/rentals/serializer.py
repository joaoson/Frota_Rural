from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers

from contracts.models import Contracts
from rentals import lifecycle
from rentals.meter import usage_summary
from rentals.models import RentalMeterReadings, Rentals
from users.enums import UserRole
from users.models import Users


def validate_operator_assignment(operator: Users | None, lessee: Users, *, lock: bool = False) -> Users | None:
    """Only a current member of the tenant's operator team can join a new booking.

    Old rentals retain their historical operator link. A new assignment, date
    change or recurrence must check today's relationship and account state.
    Callers holding reservation locks can also lock the user until commit, so a
    concurrent team unlink cannot invalidate the check before the rental saves.
    """
    if operator is None:
        return None
    queryset = Users.objects.all()
    if lock:
        queryset = queryset.select_for_update(no_key=True)
    current = queryset.filter(pk=operator.pk).first()
    if (current is None or current.role != UserRole.OPERATOR
            or current.employer_id != lessee.pk
            or current.status not in (None, "", "active")):
        raise serializers.ValidationError({
            "operator": "O operador precisa estar ativo e vinculado à sua equipe. "
                        "Atualize o vínculo na aba Operadores ou crie uma nova reserva sem esse operador."
        })
    return current


class RentalInputSerializer(serializers.ModelSerializer[Rentals]):
    """Campos da locação que o cliente pode gravar.

    Aqui fica só a validação que depende do próprio payload. A checagem de
    conflito com outras reservas consulta o banco e mora no `RentalService`.
    O valor não é gravável: a cotação é calculada e congelada pelo servidor.
    """

    class Meta:
        model = Rentals
        fields = [
            "postings",
            "lessee",
            "operator",
            "start_date",
            "end_date",
            "notes",
            "status",
        ]
        extra_kwargs = {"notes": {"max_length": 1000, "allow_blank": True, "required": False}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            # Os vínculos não mudam após a criação (o RentalService recusa um valor
            # diferente). Repetir o mesmo valor não pode valer como pedido de
            # alteração, nem disparar novo cálculo de preço.
            for field in ("postings", "lessee"):
                self.fields.pop(field)

    def validate(self, attrs):
        """Keep a day free before and after each rental for machine turnaround."""
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        posting = attrs.get("postings", getattr(self.instance, "postings", None))

        if not start_date or not end_date or not posting:
            return attrs
        if end_date < start_date:
            raise serializers.ValidationError({"end_date": "A data de fim deve ser posterior à data de início."})

        if self.instance and not any(field in attrs for field in ('start_date', 'end_date')):
            # Cancellation and notes must still work if an expired hold has
            # since been taken by another renter.
            return attrs
        if not self.instance or any(field in attrs for field in ('start_date', 'end_date')):
            if posting.status != 'active' or posting.machinery.status != 'active':
                raise serializers.ValidationError({'postings': 'O anúncio e a máquina precisam estar ativos.'})
            if start_date <= timezone.now():
                raise serializers.ValidationError({'start_date': 'Escolha uma data futura.'})
            if (posting.availability_start and start_date < posting.availability_start) or (
                posting.availability_end and end_date > posting.availability_end
            ):
                raise serializers.ValidationError({'start_date': 'O período está fora da disponibilidade do anúncio.'})

        max_reservation_days = posting.max_reservation_days
        total_days = (end_date.date() - start_date.date()).days + 1
        if max_reservation_days and total_days > max_reservation_days:
            raise serializers.ValidationError(
                {"end_date": f"Este anúncio permite reservas de no máximo {max_reservation_days} dias."}
            )

        return attrs


class RentalFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de locações."""

    postings = serializers.UUIDField(required=False, help_text="ID do anúncio.")
    lessee = serializers.UUIDField(required=False, help_text="ID do locatário.")
    lessor = serializers.UUIDField(required=False, help_text="ID do locador dono do maquinário.")


class RentalOutputSerializer(serializers.ModelSerializer[Rentals]):
    lessee_name = serializers.CharField(source="lessee.name", read_only=True)
    lessor_id = serializers.CharField(source="postings.machinery.owner_id", read_only=True)
    lessor_name = serializers.CharField(source="postings.machinery.owner.name", read_only=True)
    machine_brand = serializers.CharField(source="postings.machinery.brand", read_only=True)
    machine_model = serializers.CharField(source="postings.machinery.model", read_only=True)
    contract_number = serializers.SerializerMethodField()
    # Estado do aceite eletrônico, para a tela saber qual parte ainda falta
    # assinar. `rentals.status` sozinho não distingue "o locador assinou" de
    # "o locatário assinou": ambos deixam o aluguel em `active`.
    contract_id = serializers.SerializerMethodField()
    signature_deadline = serializers.SerializerMethodField()
    refunds = serializers.SerializerMethodField()
    contract_status = serializers.SerializerMethodField()
    accepted_by_lessor = serializers.SerializerMethodField()
    accepted_by_lessee = serializers.SerializerMethodField()
    # Leitura única do ciclo de vida (rentals.lifecycle): as telas não decidem por status.
    phase = serializers.SerializerMethodField()
    phase_label = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField(
        help_text="Ações que o usuário autenticado pode executar agora (vazio sem usuário no contexto)."
    )
    meter = serializers.SerializerMethodField(
        help_text="Leituras vigentes do horímetro e horas usadas. Informativo: não altera o valor."
    )

    class Meta:
        model = Rentals
        fields = [
            "id",
            "postings",
            "lessee",
            "operator",
            "start_date",
            "end_date",
            "total_price",
            "hourly_rate_snapshot",
            "daily_rate",
            "billable_days",
            "subtotal",
            "platform_fee_rate",
            "platform_fee",
            "initial_hour_meter",
            "final_hour_meter",
            "meter",
            "status",
            "phase",
            "phase_label",
            "allowed_actions",
            "notes",
            "created_at",
            "updated_at",
            "lessee_name",
            "lessor_name",
            "lessor_id",
            "recurrence",
            "recurrence_index",
            "reservation_expires_at",
            "machine_brand",
            "machine_model",
            "contract_number",
            "contract_id",
            "signature_deadline",
            "refunds",
            "cancellation_policy_version",
            "cancelled_at",
            "cancellation_reason",
            "contract_status",
            "accepted_by_lessor",
            "accepted_by_lessee",
        ]
        read_only_fields = fields

    @staticmethod
    def _contract(obj: Rentals) -> Contracts | None:
        """Contrato do aluguel, ou None enquanto ele ainda não foi criado."""
        try:
            return obj.contracts
        except ObjectDoesNotExist:
            return None

    def get_signature_deadline(self, obj):
        contract = self._contract(obj)
        return contract.signature_deadline if contract else None

    def get_refunds(self, obj):
        from payments.models import Refunds
        return [{"id": str(refund.pk), "amount": str(refund.amount), "status": refund.status}
                for refund in Refunds.objects.filter(payment__rental=obj).order_by("created_at")]

    def get_contract_number(self, obj: Rentals) -> str:
        """Número legível do contrato, ex.: #CTR-08E8."""
        return f"#CTR-{str(obj.id)[:4].upper()}"

    def get_contract_id(self, obj: Rentals) -> str | None:
        contract = self._contract(obj)
        return str(contract.id) if contract else None

    def get_contract_status(self, obj: Rentals) -> str | None:
        contract = self._contract(obj)
        return contract.status if contract else None

    def get_accepted_by_lessor(self, obj: Rentals) -> bool:
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessor) if contract else False

    def get_accepted_by_lessee(self, obj: Rentals) -> bool:
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessee) if contract else False

    def get_phase(self, obj: Rentals) -> str:
        return lifecycle.phase(obj).value

    def get_phase_label(self, obj: Rentals) -> str:
        return lifecycle.phase(obj).label

    def get_meter(self, obj: Rentals) -> dict[str, Any]:
        return usage_summary(obj)

    def get_allowed_actions(self, obj: Rentals) -> list[str]:
        return lifecycle.allowed_actions(obj, self.context.get("user"))


class RentalMeterReadingOutputSerializer(serializers.ModelSerializer[RentalMeterReadings]):
    class Meta:
        model = RentalMeterReadings
        fields = ["id", "rental", "kind", "value", "note", "recorded_by", "recorded_at", "supersedes"]
        read_only_fields = fields
