# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models

# if id = models.UUIDField(primary_key=True), JSON request needs to contain an ID field.
# for id to be created auto by Django, use id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

# For auto date in created_at, field should equal to models.DateTimeField(auto_now_add=True)
# For auto date in updated_at, field should equal to models.DateTimeField(auto_now=True)

class Contracts(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.OneToOneField('Rentals', models.DO_NOTHING)
    document_url = models.CharField(max_length=1024, blank=True, null=True)
    accepted_by_lessor = models.BooleanField(blank=True, null=True)
    accepted_by_lessee = models.BooleanField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'contracts'


class Credentials(models.Model):
    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey('Users', models.DO_NOTHING)
    type = models.TextField()  # This field type is a guess.
    document_number = models.CharField(max_length=50, blank=True, null=True)
    expiration_date = models.DateField(blank=True, null=True)
    file_url = models.CharField(max_length=1024, blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'credentials'


class Machines(models.Model):
    id = models.UUIDField(primary_key=True)
    owner = models.ForeignKey('Users', models.DO_NOTHING)
    renagro_number = models.CharField(unique=True, max_length=100, blank=True, null=True)
    brand = models.CharField(max_length=100, blank=True, null=True)
    model = models.CharField(max_length=100, blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    technical_specifications = models.TextField(blank=True, null=True)
    usage_purpose = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'machines'


class Messages(models.Model):
    id = models.UUIDField(primary_key=True)
    sender = models.ForeignKey('Users', models.DO_NOTHING)
    receiver = models.ForeignKey('Users', models.DO_NOTHING, related_name='messages_receiver_set')
    rental = models.ForeignKey('Rentals', models.DO_NOTHING)
    content = models.TextField()
    sent_at = models.DateTimeField(blank=True, null=True)
    flagged_for_moderation = models.BooleanField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'messages'


class Postings(models.Model):
    id = models.UUIDField(primary_key=True)
    machinery = models.ForeignKey(Machines, models.DO_NOTHING)
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


class Rentals(models.Model):
    id = models.UUIDField(primary_key=True)
    postings = models.ForeignKey(Postings, models.DO_NOTHING)
    lessee = models.ForeignKey('Users', models.DO_NOTHING)
    operator = models.ForeignKey('Users', models.DO_NOTHING, related_name='rentals_operator_set', blank=True, null=True)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    total_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    initial_hour_meter = models.IntegerField(blank=True, null=True)
    final_hour_meter = models.IntegerField(blank=True, null=True)
    status = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'rentals'


class Reviews(models.Model):
    id = models.UUIDField(primary_key=True)
    rental = models.ForeignKey(Rentals, models.DO_NOTHING)
    reviewer = models.ForeignKey('Users', models.DO_NOTHING)
    reviewee = models.ForeignKey('Users', models.DO_NOTHING, related_name='reviews_reviewee_set')
    rating = models.IntegerField()
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # managed = False
        db_table = 'reviews'
        unique_together = (('rental', 'reviewer'),)


class UsersManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class Users(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    document = models.CharField(unique=True, max_length=20)
    email = models.CharField(unique=True, max_length=255)
    # password field provided by AbstractBaseUser
    phone = models.CharField(max_length=20, blank=True, null=True)
    role = models.TextField()
    address = models.TextField()
    birth_date = models.DateField()
    status = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name', 'document', 'role', 'address', 'birth_date']

    objects = UsersManager()

    class Meta:
        # managed = False
        db_table = 'users'
