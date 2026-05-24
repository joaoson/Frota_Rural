from django.db import models


# Create your models here.
class Postings(models.Model):
    id = models.UUIDField(primary_key=True)
    machinery = models.ForeignKey('machines.Machines', models.DO_NOTHING)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    location_lat = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    location_lng = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    location_address = models.TextField(blank=True, null=True)
    availability_start = models.DateTimeField(blank=True, null=True)
    availability_end = models.DateTimeField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'postings'


class PostingsPhotos(models.Model):
    id = models.UUIDField(primary_key=True)
    postings = models.ForeignKey(Postings, models.DO_NOTHING)
    image_url = models.CharField(max_length=1024)
    is_primary = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'postings_photos'