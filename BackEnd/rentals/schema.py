"""Contratos OpenAPI para entradas por ação e respostas compostas de locação."""

from rest_framework import serializers

from rentals.serializer import RentalInputSerializer, RentalMeterReadingOutputSerializer, RentalOutputSerializer


class RentalCreateInputSerializer(RentalInputSerializer):
    class Meta(RentalInputSerializer.Meta):
        fields = [field for field in RentalInputSerializer.Meta.fields if field != "status"]
        extra_kwargs = {
            **RentalInputSerializer.Meta.extra_kwargs,
            "postings": {"help_text": "UUID de um anúncio ativo de outro usuário."},
            "lessee": {"help_text": "UUID do usuário locatário autenticado."},
            "operator": {"help_text": "Opcional: operador ativo vinculado à equipe do locatário; pode ser null."},
        }


class RentalUpdateInputSerializer(RentalInputSerializer):
    class Meta(RentalInputSerializer.Meta):
        fields = ["operator", "start_date", "end_date", "notes"]


class BookingPolicyOutputSerializer(serializers.Serializer):
    antecedencia_minima_dias = serializers.IntegerField(help_text="Antecedência mínima em dias de calendário.")
    data_minima_inicio = serializers.DateField(help_text="Primeiro dia permitido para início de uma nova reserva.")


class MeterRecordOutputSerializer(serializers.Serializer):
    reading = RentalMeterReadingOutputSerializer()
    warnings = serializers.ListField(child=serializers.CharField(), help_text="Alertas informativos; vazio quando não há alertas.")
    rental = RentalOutputSerializer()


class RentalCompleteInputSerializer(serializers.Serializer):
    final_hour_meter = serializers.IntegerField(required=False, min_value=0, max_value=60000,
                                                help_text="Leitura de devolução opcional; exige retirada registrada.")
    note = serializers.CharField(required=False, allow_blank=True, max_length=500,
                                 help_text="Observação da leitura, usada somente com final_hour_meter.")


class LastMachineReadingSerializer(serializers.Serializer):
    valor = serializers.IntegerField()
    registrada_em = serializers.DateTimeField()


class MachineUsageOutputSerializer(serializers.Serializer):
    locacoes_concluidas = serializers.IntegerField()
    diarias = serializers.IntegerField()
    locacoes_com_leitura = serializers.IntegerField()
    horas_registradas = serializers.IntegerField()
    media_horas_por_diaria = serializers.DecimalField(max_digits=12, decimal_places=1, allow_null=True,
                                                     help_text="Média apenas das locações com leituras; null quando não há medições.")
    referencia_horas_por_diaria = serializers.IntegerField()
    ultima_leitura = LastMachineReadingSerializer(allow_null=True)


class LessorDashboardPeriodSerializer(serializers.Serializer):
    months = serializers.IntegerField()
    start = serializers.DateField(help_text="Primeiro dia do mês mais antigo da série.")
    end = serializers.DateField(help_text="Data atual no fuso informado.")
    time_zone = serializers.CharField()


class LessorDashboardTotalsSerializer(serializers.Serializer):
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2,
                                       help_text="Valor bruto das locações concluídas no período, por data de término.")
    current_month_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    completed_rentals = serializers.IntegerField()
    reviews = serializers.IntegerField(help_text="Avaliações recebidas no período.")
    average_rating = serializers.DecimalField(max_digits=3, decimal_places=2, allow_null=True,
                                              help_text="Média das avaliações do período; null sem avaliações.")
    open_rentals = serializers.IntegerField(help_text="Locações ainda não concluídas nem canceladas, de qualquer data.")
    rentals = serializers.IntegerField(help_text="Todas as locações das suas máquinas, de qualquer data.")


class LessorDashboardMonthSerializer(serializers.Serializer):
    month = serializers.DateField(help_text="Primeiro dia do mês.")
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    completed_rentals = serializers.IntegerField()
    reviews = serializers.IntegerField()
    average_rating = serializers.DecimalField(max_digits=3, decimal_places=2, allow_null=True)


class LessorDashboardStatusSerializer(serializers.Serializer):
    status = serializers.CharField()
    label = serializers.CharField()
    total = serializers.IntegerField()


class LessorDashboardMachineSerializer(serializers.Serializer):
    machine = serializers.UUIDField()
    name = serializers.CharField()
    completed_rentals = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


class LessorDashboardOutputSerializer(serializers.Serializer):
    period = LessorDashboardPeriodSerializer()
    machine = serializers.UUIDField(allow_null=True, help_text="Máquina filtrada; null para toda a frota.")
    totals = LessorDashboardTotalsSerializer()
    monthly = LessorDashboardMonthSerializer(many=True, help_text="Um item por mês, inclusive meses sem movimento.")
    status_breakdown = LessorDashboardStatusSerializer(many=True, help_text="Contagem por status, de qualquer data.")
    top_machines = LessorDashboardMachineSerializer(
        many=True, help_text="Até 5 máquinas com maior valor concluído no período.",
    )
