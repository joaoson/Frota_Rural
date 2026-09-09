from django.db import models


class MachineValuations(models.Model):
    """Cache da pesquisa de mercado por (marca, modelo, ano).

    Vários anúncios do mesmo modelo compartilham a mesma pesquisa, e o valor de
    um usado não muda de uma semana para a outra. Sem este cache, cada anúncio
    novo dispararia uma busca completa — caro e lento sem ganho nenhum.
    """

    id = models.UUIDField(primary_key=True)

    # Guardados normalizados (minúsculas, sem espaço nas pontas) para "John Deere"
    # e "john deere " caírem no mesmo registro.
    brand = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.IntegerField(blank=True, null=True)

    payload = models.JSONField()
    """Resposta da pesquisa, como veio de `research.MachineResearch`."""

    confidence = models.CharField(max_length=10)
    researched_at = models.DateTimeField()
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'machine_valuations'
        unique_together = (('brand', 'model', 'year'),)
        indexes = [
            models.Index(fields=['brand', 'model', 'year'], name='machine_val_brand_idx')
        ]

    def __str__(self):
        return f"{self.brand} {self.model} {self.year or '-'}"


class PricingSuggestions(models.Model):
    """Registro de cada sugestão gerada.

    Serve a duas coisas: explicar depois por que um anúncio foi sugerido a certo
    valor (com a versão de parâmetros da época), e formar o conjunto de
    calibração — sugestão × preço que o locador de fato escolheu × conversão do
    anúncio em locação. É por aqui que a plataforma deixa de depender da IA.
    """

    id = models.UUIDField(primary_key=True)
    machinery = models.ForeignKey('machines.Machines', models.DO_NOTHING)

    suggested_hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    cost_hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    range_min = models.DecimalField(max_digits=10, decimal_places=2)
    range_max = models.DecimalField(max_digits=10, decimal_places=2)

    source = models.CharField(max_length=20)
    """De onde veio o valor de mercado: `pesquisa`, `cache`, `comparaveis`."""

    confidence = models.CharField(max_length=10)
    params_version = models.CharField(max_length=20)
    inputs = models.JSONField()
    breakdown = models.JSONField()

    # Preenchido quando o anúncio é criado, para comparar sugerido × escolhido.
    # Nulo significa "ainda não sabemos", não "recusou".
    accepted_hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True
    )
    posting = models.ForeignKey(
        'postings.Postings', models.DO_NOTHING, blank=True, null=True
    )

    created_at = models.DateTimeField()

    class Meta:
        db_table = 'pricing_suggestions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['machinery', '-created_at'], name='pricing_sug_machine_idx')
        ]
