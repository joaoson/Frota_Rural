from django.db import models


class OperatorLicense(models.Model):

    class Category(models.TextChoices):
        A = 'A'
        B = 'B'
        C = 'C'
        D = 'D'
        E = 'E'
        AB = 'AB', 'AB'
        AC = 'AC', 'AC'
        AD = 'AD', 'AD'
        AE = 'AE', 'AE'

    class Situation(models.TextChoices):
        ACTIVE = 'active'
        EXPIRED = 'expired'
        SUSPENDED = 'suspended'
        REVOKED = 'revoked'
        BLOCKED = 'blocked'
        PPD = 'ppd'

    class ValidationStatus(models.TextChoices):
        PENDING = 'pending'
        APPROVED = 'approved'
        REJECTED = 'rejected'

    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey('users.Users', models.CASCADE)

    name = models.CharField(max_length=255)
    birth_date = models.DateField()
    cpf = models.CharField(max_length=14)
    rg = models.CharField(max_length=20)
    mother_name = models.CharField(max_length=255)
    father_name = models.CharField(max_length=255, blank=True, null=True)
    nationality = models.CharField(max_length=100)
    birth_place = models.CharField(max_length=255)

    cnh_number = models.CharField(max_length=11)
    category = models.CharField(max_length=2, choices=Category.choices)
    first_license_date = models.DateField()
    issue_date = models.DateField()
    expiration_date = models.DateField()
    issuing_state = models.CharField(max_length=2)
    issuing_authority = models.CharField(max_length=255)

    situation = models.CharField(max_length=20, choices=Situation.choices)
    acc = models.BooleanField(default=False)
    ear = models.BooleanField(default=False)

    medical_restrictions = models.TextField(blank=True, null=True)
    observations = models.TextField(blank=True, null=True)
    points = models.IntegerField(default=0)

    file_url = models.CharField(max_length=1024, blank=True, null=True)

    validation_status = models.CharField(
        max_length=10,
        choices=ValidationStatus.choices,
        default=ValidationStatus.PENDING,
    )

    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'operator_licenses'


class Certification(models.Model):

    class ValidationStatus(models.TextChoices):
        PENDING = 'pending'
        APPROVED = 'approved'
        REJECTED = 'rejected'

    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey('users.Users', models.CASCADE)

    issuing_organization = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    issue_date = models.DateField()
    credential_code = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField()
    media_url = models.CharField(max_length=1024, blank=True, null=True)

    validation_status = models.CharField(
        max_length=10,
        choices=ValidationStatus.choices,
        default=ValidationStatus.PENDING,
    )

    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'certifications'
