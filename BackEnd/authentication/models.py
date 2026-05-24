import uuid
from django.db import models
from users.models import Users

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

class PasswordResets(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Users, models.CASCADE)
    token_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_resets'
