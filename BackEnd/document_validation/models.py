import uuid

from django.db import models

from document_validation.enums import LicenseCategory, LicenseSituation, ValidationStatus


class TipoVinculo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "tipos_vinculo"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


class OperatorLicense(models.Model):
    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey("users.Users", models.CASCADE)

    name = models.CharField(max_length=255)
    birth_date = models.DateField()
    cpf = models.CharField(max_length=14)
    rg = models.CharField(max_length=20)
    mother_name = models.CharField(max_length=255)
    father_name = models.CharField(max_length=255, blank=True, null=True)
    nationality = models.CharField(max_length=100)
    birth_place = models.CharField(max_length=255)

    cnh_number = models.CharField(max_length=11)
    category = models.CharField(max_length=2, choices=LicenseCategory.choices)
    first_license_date = models.DateField()
    issue_date = models.DateField()
    expiration_date = models.DateField()
    issuing_state = models.CharField(max_length=2)
    issuing_authority = models.CharField(max_length=255)

    situation = models.CharField(max_length=20, choices=LicenseSituation.choices)
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
    review_note = models.TextField(blank=True, null=True)
    # True quando a recusa veio do modelo de plausibilidade, não de um administrador.
    # Serve para não tratar a saída do próprio modelo como verdade em um retreino.
    auto_rejected = models.BooleanField(default=False)
    # Índice de veracidade do modelo `cnh_data` (0-100, maior = mais verdadeiro). Nulo quando o
    # modelo está desligado ou indisponível.
    veracity_score = models.PositiveSmallIntegerField(
        blank=True,
        null=True,
        help_text="Índice de veracidade dos dados (0 a 100), calculado pelo modelo de ML.",
    )
    # Por que o modelo recusou (regras violadas, campos que não conferem com a foto...), para o
    # administrador. A `review_note` que o dono vê continua genérica. Vazio se não foi recusada.
    auto_rejection_reasons = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    tipo_vinculo = models.ForeignKey(TipoVinculo, models.PROTECT, blank=True, null=True)

    class Meta:
        db_table = "operator_licenses"

    def __str__(self) -> str:
        return f"CNH {self.cnh_number} ({self.name})"


class AreaCertificacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "areas_certificacao"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


class Certification(models.Model):
    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey("users.Users", models.CASCADE)

    issuing_organization = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    issue_date = models.DateField()
    expiration_date = models.DateField(blank=True, null=True)
    credential_code = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField()
    media_url = models.CharField(max_length=1024, blank=True, null=True)

    validation_status = models.CharField(
        max_length=10,
        choices=ValidationStatus.choices,
        default=ValidationStatus.PENDING,
    )
    review_note = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    area = models.ForeignKey(AreaCertificacao, models.PROTECT, blank=True, null=True)

    class Meta:
        db_table = "certifications"

    def __str__(self) -> str:
        return f"{self.title} ({self.issuing_organization})"
