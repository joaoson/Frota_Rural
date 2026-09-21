import uuid
from datetime import timedelta
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from api.models import Rentals, Reviews


class ReviewSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    reviewer_name = serializers.CharField(source='reviewer.name', read_only=True)
    reviewee_name = serializers.CharField(source='reviewee.name', read_only=True)

    class Meta:
        model = Reviews
        fields = [
            "id",
            "rental",
            "reviewer",
            "reviewer_name",
            "reviewee",
            "reviewee_name",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        request = self.context.get('request')
        rental = attrs.get('rental', getattr(self.instance, 'rental', None))
        reviewer = attrs.get('reviewer', getattr(self.instance, 'reviewer', None))
        reviewee = attrs.get('reviewee', getattr(self.instance, 'reviewee', None))
        if self.instance:
            for field in ('rental', 'reviewer', 'reviewee'):
                if field in attrs and attrs[field].pk != getattr(self.instance, f'{field}_id'):
                    raise serializers.ValidationError({field: 'Este vínculo não pode ser alterado.'})
        if request and reviewer and reviewer.pk != request.user.pk:
            raise serializers.ValidationError({'reviewer': 'Você só pode avaliar em seu próprio nome.'})
        if rental and reviewer and reviewee:
            if rental.status != 'completed':
                raise serializers.ValidationError({'rental': 'A avaliação fica disponível após a conclusão da locação.'})
            parties = {rental.lessee_id, rental.postings.machinery.owner_id}
            if reviewer.pk not in parties or reviewee.pk not in parties or reviewer.pk == reviewee.pk:
                raise serializers.ValidationError({'reviewee': 'Avalie a outra parte desta locação.'})
        return attrs

    def create(self, validated_data):
        return Reviews.objects.create(
            id=uuid.uuid4(),
            created_at=timezone.now(),
            **validated_data,
        )


class RentalSerializer(serializers.ModelSerializer):
    lessee_name = serializers.CharField(source="lessee.name", read_only=True)
    lessor_id = serializers.CharField(source="postings.machinery.owner_id", read_only=True)
    lessor_name = serializers.CharField(source="postings.machinery.owner.name", read_only=True)
    machine_brand = serializers.CharField(source="postings.machinery.brand", read_only=True)
    machine_model = serializers.CharField(source="postings.machinery.model", read_only=True)
    contract_number = serializers.SerializerMethodField(read_only=True)
    # Estado do aceite eletrônico, para a tela saber qual parte ainda falta
    # assinar. `rentals.status` sozinho não distingue "o locador assinou" de
    # "o locatário assinou": ambos deixam o aluguel em `active`.
    contract_id = serializers.SerializerMethodField(read_only=True)
    contract_status = serializers.SerializerMethodField(read_only=True)
    accepted_by_lessor = serializers.SerializerMethodField(read_only=True)
    accepted_by_lessee = serializers.SerializerMethodField(read_only=True)

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
            "initial_hour_meter",
            "final_hour_meter",
            "status",
            "created_at",
            "updated_at",
            "lessee_name",
            "lessor_name",
            "lessor_id",
            "machine_brand",
            "machine_model",
            "contract_number",
            "contract_id",
            "contract_status",
            "accepted_by_lessor",
            "accepted_by_lessee",
            "recurrence",
            "recurrence_index",
            "reservation_expires_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "recurrence", "recurrence_index", "reservation_expires_at"]

    @extend_schema_field(serializers.CharField(help_text='Número legível do contrato, ex.: #CTR-08E8'))
    def get_contract_number(self, obj):
        try:
            return f"#CTR-{str(obj.id)[:4].upper()}"
        except Exception:
            return ""

    @staticmethod
    def _contract(obj):
        """Contrato do aluguel, ou None enquanto ele ainda não foi criado."""
        try:
            return obj.contracts
        except ObjectDoesNotExist:
            return None

    def get_contract_id(self, obj):
        contract = self._contract(obj)
        return str(contract.id) if contract else None

    def get_contract_status(self, obj):
        contract = self._contract(obj)
        return contract.status if contract else None

    def get_accepted_by_lessor(self, obj):
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessor) if contract else False

    def get_accepted_by_lessee(self, obj):
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessee) if contract else False

    def create(self, validated_data):
        from payments.availability import MINUTOS_DE_RESERVA

        now = timezone.now()
        validated_data.setdefault("id", uuid.uuid4())
        validated_data.setdefault("created_at", now)
        validated_data.setdefault("updated_at", now)
        validated_data.setdefault("status", "pending")
        validated_data.setdefault("reservation_expires_at", now + timedelta(minutes=MINUTOS_DE_RESERVA))
        return Rentals.objects.create(**validated_data)

    def validate(self, attrs):
        """Keep a day free before and after each rental for machine turnaround."""
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        posting = attrs.get("postings", getattr(self.instance, "postings", None))

        if not start_date or not end_date or not posting:
            return attrs
        if end_date < start_date:
            raise serializers.ValidationError({"end_date": "A data de fim deve ser posterior à data de início."})

        if self.instance and not any(field in attrs for field in ('start_date', 'end_date', 'postings')):
            # Cancellation and meter updates must still work if an expired hold
            # has since been taken by another renter.
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

        # A requested range cannot touch an existing reservation's cleaning buffer.
        from payments.availability import tem_conflito

        if tem_conflito(posting.pk, start_date, end_date, ignorar=getattr(self.instance, 'pk', None)):
            raise serializers.ValidationError(
                {"non_field_errors": "O período selecionado conflita com uma reserva ou com o intervalo de limpeza da máquina."}
            )

        return attrs
