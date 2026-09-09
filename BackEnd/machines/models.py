from django.db import models

# Create your models here.
class Machines(models.Model):
    id = models.UUIDField(primary_key=True)
    owner = models.ForeignKey('users.Users', models.DO_NOTHING)
    renagro_number = models.CharField(unique=True, max_length=100, blank=True, null=True)
    brand = models.CharField(max_length=100, blank=True, null=True)
    model = models.CharField(max_length=100, blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)

    # Potência nominal em cavalos. É o melhor normalizador que temos para
    # comparar máquinas entre si (um trator de 110 cv e um de 300 cv não são o
    # mesmo produto) e entra no consumo estimado de diesel da precificação.
    power_cv = models.PositiveIntegerField(blank=True, null=True)

    # Horímetro acumulado da máquina, em horas de motor. Não dá para derivar de
    # `Rentals`: aquelas leituras só cobrem as horas rodadas dentro da
    # plataforma, e a máquina trabalha muito mais fora dela. Por isso o valor é
    # declarado pelo locador e atualizado a cada check-out.
    hour_meter = models.PositiveIntegerField(blank=True, null=True)
    hour_meter_updated_at = models.DateTimeField(blank=True, null=True)

    technical_specifications = models.TextField(blank=True, null=True)
    usage_purpose = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'machines'
