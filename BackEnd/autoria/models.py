# Create your models here.
import uuid
from django.db import models



class Genero(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    Genero = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "Genero"
        ordering = ["Genero"]

    def __str__(self):
        return self.Genero