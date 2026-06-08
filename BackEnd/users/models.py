import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager

# Create your models here.
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
    cep = models.CharField(max_length=9, blank=True, null=True)
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
