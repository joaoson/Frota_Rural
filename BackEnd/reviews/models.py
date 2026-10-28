import uuid

from django.db import models


class CriterioAvaliacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "criterios_avaliacao"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


class Reviews(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.ForeignKey("rentals.Rentals", models.DO_NOTHING)
    reviewer = models.ForeignKey("users.Users", models.DO_NOTHING)
    reviewee = models.ForeignKey(
        "users.Users", models.DO_NOTHING, related_name="reviews_reviewee_set"
    )
    rating = models.IntegerField()
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    criterio = models.ForeignKey(CriterioAvaliacao, models.PROTECT, blank=True, null=True)

    class Meta:
        db_table = "reviews"
        unique_together = (("rental", "reviewer"),)

    def __str__(self) -> str:
        return f"Avaliação {self.rating}/5 da locação {self.rental_id}"
