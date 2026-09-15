from django.db import models

from postings.enums import PostingStatus


class Postings(models.Model):
    id = models.UUIDField(primary_key=True)
    machinery = models.ForeignKey("machines.Machines", models.DO_NOTHING)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    location_lat = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    location_lng = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    # Guardado só com dígitos (8 caracteres). A máscara é aplicada na exibição,
    # para a busca por CEP não depender de como o locador digitou.
    location_cep = models.CharField(max_length=8, blank=True, null=True)
    location_address = models.TextField(blank=True, null=True)
    availability_start = models.DateTimeField(blank=True, null=True)
    availability_end = models.DateTimeField(blank=True, null=True)
    # Nulo significa que o locador não impõe limite de duração à reserva.
    max_reservation_days = models.PositiveIntegerField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    status = models.TextField(choices=PostingStatus.choices, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "postings"

    def __str__(self) -> str:
        return f"Anúncio {self.id}"


class PostingsPhotos(models.Model):
    id = models.UUIDField(primary_key=True)
    postings = models.ForeignKey(Postings, models.DO_NOTHING)
    image_url = models.CharField(max_length=1024)
    is_primary = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "postings_photos"

    def __str__(self) -> str:
        return self.image_url
