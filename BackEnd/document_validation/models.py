from django.db import models

# Create your models here.
class Credentials(models.Model):
    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey('users.Users', models.DO_NOTHING)
    type = models.TextField()  # This field type is a guess.
    document_number = models.CharField(max_length=50, blank=True, null=True)
    expiration_date = models.DateField(blank=True, null=True)
    file_url = models.CharField(max_length=1024, blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'credentials'
