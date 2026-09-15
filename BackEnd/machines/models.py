from django.db import models

from machines.enums import MachineStatus


class Machines(models.Model):
    id = models.UUIDField(primary_key=True)
    owner = models.ForeignKey("users.Users", models.DO_NOTHING)
    renagro_number = models.CharField(unique=True, max_length=100, blank=True, null=True)
    brand = models.CharField(max_length=100, blank=True, null=True)
    model = models.CharField(max_length=100, blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    technical_specifications = models.TextField(blank=True, null=True)
    usage_purpose = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, choices=MachineStatus.choices, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "machines"

    def __str__(self) -> str:
        return " ".join(filter(None, [self.brand, self.model])) or str(self.id)
