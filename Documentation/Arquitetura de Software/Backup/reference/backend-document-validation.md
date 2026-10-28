# Referência — `document_validation` em quatro camadas

Implementação **completa e copiável** do módulo piloto. Substitui as 289 linhas de
`BackEnd/document_validation/views.py`, das quais cerca de 230 são duplicação.

Os nomes de campo correspondem exatamente ao model atual (`document_validation/models.py`).

---

## Camada 0 — `core/` (compartilhado)

### `core/exceptions.py`

```python
class DomainError(Exception):
    """Base de todo erro de negócio. Nunca capturada em views."""

    code: str = "domain_error"
    http_status: int = 400

    def __init__(self, message: str = "", **context):
        super().__init__(message or self.__class__.__doc__ or self.code)
        self.context = context


class NotFoundError(DomainError):
    """Recurso não encontrado."""
    code, http_status = "not_found", 404


class ConflictError(DomainError):
    """Conflito com o estado atual do recurso."""
    code, http_status = "conflict", 409


class ValidationError(DomainError):
    """Dados inválidos segundo as regras de negócio."""
    code, http_status = "validation_error", 400


class ServiceUnavailableError(DomainError):
    """Dependência externa indisponível."""
    code, http_status = "service_unavailable", 503
```

### `core/exception_handler.py`

```python
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.exceptions import DomainError


def domain_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response(
            {"code": exc.code, "error": str(exc), **exc.context},
            status=exc.http_status,
        )
    return drf_exception_handler(exc, context)
```

Registrar uma única vez em `djangoapi/settings.py`:

```python
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "core.exception_handler.domain_exception_handler",
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}
```

> A segunda linha corrige o `AllowAny` implícito que hoje deixa `/api/admin/users/<pk>/ban` e
> `/api/operator-licenses/<pk>/review` acessíveis sem autenticação.

### `core/models.py` — Layer Supertype

```python
import uuid
from django.db import models


class UUIDTimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

> ⚠️ Requer migration: altera `id`, `created_at` e `updated_at` de cinco models. É o que elimina o
> bloco `uuid.uuid4()` + timestamps copiado em quatro serializers.

---

## Camada 1 — `domain/`

**Nenhum import de Django nesta camada.** É o teste de aceitação.

### `domain/exceptions.py`

```python
from core.exceptions import ConflictError, NotFoundError, ValidationError


class InvalidCPF(ValidationError):
    """CPF inválido."""
    code = "invalid_cpf"


class InvalidCnhNumber(ValidationError):
    """Número de CNH inválido."""
    code = "invalid_cnh_number"


class RejectionRequiresNote(ValidationError):
    """O motivo da rejeição é obrigatório."""
    code = "rejection_requires_note"


class DocumentAlreadyReviewed(ConflictError):
    """Documento já foi revisado."""
    code = "already_reviewed"


class DocumentNotFound(NotFoundError):
    """Documento não encontrado."""
    code = "document_not_found"


class UnsupportedFileType(ValidationError):
    """Tipo de arquivo não suportado. Envie JPG, PNG ou PDF."""
    code = "unsupported_file_type"


class FileTooLarge(ValidationError):
    """Arquivo excede o tamanho máximo de 20MB."""
    code = "file_too_large"


class MissingFile(ValidationError):
    """Nenhum arquivo enviado."""
    code = "missing_file"
```

> `core.exceptions` é Python puro — importá-lo não viola a Regra da Dependência.

### `domain/value_objects.py`

```python
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from .exceptions import InvalidCPF, InvalidCnhNumber


class ValidationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

    @classmethod
    def reviewable_targets(cls) -> frozenset[ValidationStatus]:
        """Status que uma revisão pode atribuir."""
        return frozenset({cls.APPROVED, cls.REJECTED})


class CnhCategory(str, Enum):
    A = "A"; B = "B"; C = "C"; D = "D"; E = "E"
    AB = "AB"; AC = "AC"; AD = "AD"; AE = "AE"


class CnhSituation(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    SUSPENDED = "suspended"
    REVOKED = "revoked"
    BLOCKED = "blocked"
    PPD = "ppd"


@dataclass(frozen=True)
class CPF:
    """CPF válido. Um CPF inválido não consegue existir."""

    digits: str

    def __post_init__(self) -> None:
        digits = re.sub(r"\D", "", self.digits)
        object.__setattr__(self, "digits", digits)
        if not self._is_valid(digits):
            raise InvalidCPF(f"CPF inválido: {self.digits}")

    @staticmethod
    def _is_valid(cpf: str) -> bool:
        if len(cpf) != 11 or cpf == cpf[0] * 11:
            return False
        for length in (9, 10):
            total = sum(int(cpf[i]) * (length + 1 - i) for i in range(length))
            check = (total * 10) % 11 % 10
            if check != int(cpf[length]):
                return False
        return True

    def masked(self) -> str:
        d = self.digits
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"

    def __str__(self) -> str:
        return self.digits


@dataclass(frozen=True)
class CnhNumber:
    value: str

    def __post_init__(self) -> None:
        value = re.sub(r"\D", "", self.value)
        object.__setattr__(self, "value", value)
        if len(value) != 11:
            raise InvalidCnhNumber(f"Número de CNH inválido: {self.value}")

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class BirthPlace:
    """Naturalidade. Substitui o campo composto separado por travessão.

    Hoje o front faz `license.birth_place.split(" – ")` na leitura e
    `f"{cidade} – {estado}"` na escrita — a estrutura existe, mas implícita.
    """

    city: str
    state: str

    SEPARATOR = " – "

    @classmethod
    def parse(cls, raw: str) -> BirthPlace:
        parts = raw.split(cls.SEPARATOR)
        if len(parts) == 2:
            return cls(city=parts[0].strip(), state=parts[1].strip())
        return cls(city=raw.strip(), state="")

    def __str__(self) -> str:
        return f"{self.city}{self.SEPARATOR}{self.state}" if self.state else self.city


@dataclass(frozen=True)
class DocumentFile:
    """Arquivo enviado, independente de Django."""

    name: str
    content_type: str
    size: int
    read: callable   # () -> bytes


@dataclass(frozen=True)
class ClassificationResult:
    is_valid: bool
    confidence: str          # "high" | "medium" | "low"
    score: float
    error: str | None = None
```

### `domain/entities.py`

```python
from __future__ import annotations

from abc import ABC
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from .exceptions import DocumentAlreadyReviewed, RejectionRequiresNote
from .value_objects import (
    BirthPlace, CPF, CnhCategory, CnhNumber, CnhSituation, ValidationStatus,
)


@dataclass
class ReviewableDocument(ABC):
    """Layer Supertype de domínio.

    Substitui a duplicação byte a byte entre `review_license` (views.py:224-255)
    e `review_certification` (views.py:258-289).
    """

    id: UUID
    user_id: UUID
    validation_status: ValidationStatus = ValidationStatus.PENDING
    review_note: str | None = None
    file_url: str | None = None

    def approve(self) -> None:
        self._guard_not_reviewed()
        self.validation_status = ValidationStatus.APPROVED
        self.review_note = None

    def reject(self, note: str | None) -> None:
        self._guard_not_reviewed()
        if not note or not note.strip():
            raise RejectionRequiresNote()
        self.validation_status = ValidationStatus.REJECTED
        self.review_note = note.strip()

    def reset_review(self) -> None:
        """Toda edição invalida a revisão anterior.

        Regra hoje escondida em `serializer.py:52-56`, dentro de `update()`.
        """
        self.validation_status = ValidationStatus.PENDING
        self.review_note = None

    def is_approved(self) -> bool:
        return self.validation_status is ValidationStatus.APPROVED

    def _guard_not_reviewed(self) -> None:
        if self.validation_status is not ValidationStatus.PENDING:
            raise DocumentAlreadyReviewed(
                f"Documento já está {self.validation_status.value}.",
                current_status=self.validation_status.value,
            )


@dataclass
class OperatorLicense(ReviewableDocument):
    name: str = ""
    birth_date: date | None = None
    cpf: CPF | None = None
    rg: str = ""
    mother_name: str = ""
    father_name: str | None = None
    nationality: str = ""
    birth_place: BirthPlace | None = None
    cnh_number: CnhNumber | None = None
    category: CnhCategory | None = None
    first_license_date: date | None = None
    issue_date: date | None = None
    expiration_date: date | None = None
    issuing_state: str = ""
    issuing_authority: str = ""
    situation: CnhSituation = CnhSituation.ACTIVE
    acc: bool = False
    ear: bool = False
    medical_restrictions: str | None = None
    observations: str | None = None
    points: int = 0

    # ── Regras de negócio ────────────────────────────────────────────────
    def is_expired(self, today: date) -> bool:
        return self.expiration_date is not None and self.expiration_date < today

    def is_suspended(self) -> bool:
        return self.situation in (
            CnhSituation.SUSPENDED, CnhSituation.REVOKED, CnhSituation.BLOCKED,
        )

    def enables_operation(self, today: date) -> bool:
        """A regra que justifica o módulo existir: esta CNH habilita a operar?"""
        return (
            self.is_approved()
            and not self.is_expired(today)
            and not self.is_suspended()
            and self.points < 20
        )


@dataclass
class Certification(ReviewableDocument):
    issuing_organization: str = ""
    institution: str = ""
    title: str = ""
    issue_date: date | None = None
    expiration_date: date | None = None
    credential_code: str | None = None
    description: str = ""

    def is_expired(self, today: date) -> bool:
        return self.expiration_date is not None and self.expiration_date < today
```

> `media_url` do model `Certification` é mapeado para `file_url` da entidade base — a diferença de
> nome existe só na persistência e morre no mapper.

### `domain/repositories.py`

```python
from abc import ABC, abstractmethod
from uuid import UUID

from .entities import Certification, OperatorLicense
from .value_objects import ValidationStatus


class OperatorLicenseRepository(ABC):
    """Porta declarada pelo domínio, implementada pela infraestrutura.

    Contrato (LSP — toda implementação deve honrar):
      - get_by_id levanta DocumentNotFound; nunca retorna None
      - save é idempotente para a mesma entidade
      - retorna entidades, nunca models do ORM
    """

    @abstractmethod
    def get_by_id(self, document_id: UUID) -> OperatorLicense: ...

    @abstractmethod
    def save(self, license: OperatorLicense) -> OperatorLicense: ...

    @abstractmethod
    def delete(self, document_id: UUID) -> None: ...

    @abstractmethod
    def find(
        self,
        *,
        user_id: UUID | None = None,
        validation_status: ValidationStatus | None = None,
    ) -> list[OperatorLicense]: ...


class CertificationRepository(ABC):
    @abstractmethod
    def get_by_id(self, document_id: UUID) -> Certification: ...

    @abstractmethod
    def save(self, certification: Certification) -> Certification: ...

    @abstractmethod
    def delete(self, document_id: UUID) -> None: ...

    @abstractmethod
    def find(
        self,
        *,
        user_id: UUID | None = None,
        validation_status: ValidationStatus | None = None,
    ) -> list[Certification]: ...
```

---

## Camada 2 — `application/`

### `application/ports.py`

```python
from abc import ABC, abstractmethod

from ..domain.value_objects import ClassificationResult, DocumentFile


class DocumentClassifier(ABC):
    """Strategy. Substitui o import concreto em views.py:35."""

    @abstractmethod
    def classify(self, file: DocumentFile) -> ClassificationResult: ...


class FileStorage(ABC):
    """Substitui os os.makedirs/open inline de views.py:204-219."""

    @abstractmethod
    def save(self, file: DocumentFile, *, folder: str) -> str:
        """Persiste e devolve a URL pública."""


class UnitOfWork(ABC):
    @abstractmethod
    def __enter__(self) -> "UnitOfWork": ...

    @abstractmethod
    def __exit__(self, exc_type, exc, tb) -> None: ...
```

### `application/dto.py`

```python
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from ..domain.entities import Certification, OperatorLicense


@dataclass(frozen=True)
class ReviewDocumentInput:
    document_id: UUID
    validation_status: str
    review_note: str | None = None


@dataclass(frozen=True)
class ListDocumentsInput:
    user_id: UUID | None = None
    validation_status: str | None = None


@dataclass(frozen=True)
class OperatorLicenseOutput:
    id: UUID
    user: UUID
    name: str
    cpf: str
    cnh_number: str
    category: str
    expiration_date: date | None
    situation: str
    points: int
    file_url: str | None
    validation_status: str
    review_note: str | None
    enables_operation: bool

    @classmethod
    def from_entity(cls, e: OperatorLicense, *, today: date) -> "OperatorLicenseOutput":
        return cls(
            id=e.id,
            user=e.user_id,
            name=e.name,
            cpf=str(e.cpf) if e.cpf else "",
            cnh_number=str(e.cnh_number) if e.cnh_number else "",
            category=e.category.value if e.category else "",
            expiration_date=e.expiration_date,
            situation=e.situation.value,
            points=e.points,
            file_url=e.file_url,
            validation_status=e.validation_status.value,
            review_note=e.review_note,
            enables_operation=e.enables_operation(today),
        )


@dataclass(frozen=True)
class CertificationOutput:
    id: UUID
    user: UUID
    issuing_organization: str
    institution: str
    title: str
    issue_date: date | None
    expiration_date: date | None
    credential_code: str | None
    description: str
    media_url: str | None
    validation_status: str
    review_note: str | None

    @classmethod
    def from_entity(cls, e: Certification) -> "CertificationOutput":
        return cls(
            id=e.id, user=e.user_id,
            issuing_organization=e.issuing_organization,
            institution=e.institution, title=e.title,
            issue_date=e.issue_date, expiration_date=e.expiration_date,
            credential_code=e.credential_code, description=e.description,
            media_url=e.file_url,
            validation_status=e.validation_status.value,
            review_note=e.review_note,
        )
```

> `enables_operation` é um campo que **só existe porque há domínio**. Hoje o front teria de recalcular
> vencimento, situação e pontos por conta própria.

### `application/validators.py` — Chain of Responsibility

Substitui os blocos de `if` duplicados em `views.py:15-32` e `:185-202`.

```python
from abc import ABC, abstractmethod

from ..domain.exceptions import FileTooLarge, MissingFile, UnsupportedFileType
from ..domain.value_objects import DocumentFile

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "application/pdf"}
)


class FileValidator(ABC):
    def __init__(self) -> None:
        self._next: FileValidator | None = None

    def then(self, nxt: "FileValidator") -> "FileValidator":
        self._next = nxt
        return nxt

    def validate(self, file: DocumentFile | None) -> None:
        self._check(file)
        if self._next:
            self._next.validate(file)

    @abstractmethod
    def _check(self, file: DocumentFile | None) -> None: ...


class RequiredFileValidator(FileValidator):
    def _check(self, file):
        if file is None:
            raise MissingFile()


class ContentTypeValidator(FileValidator):
    def _check(self, file):
        if file.content_type not in ALLOWED_TYPES:
            raise UnsupportedFileType(allowed=sorted(ALLOWED_TYPES))


class MaxSizeValidator(FileValidator):
    def _check(self, file):
        if file.size > MAX_FILE_SIZE:
            raise FileTooLarge(max_bytes=MAX_FILE_SIZE)


def default_upload_chain() -> FileValidator:
    head = RequiredFileValidator()
    head.then(ContentTypeValidator()).then(MaxSizeValidator())
    return head
```

### `application/use_cases/review_document.py` — Template Method

O núcleo da refatoração.

```python
from abc import ABC, abstractmethod
from datetime import date

from ...domain.entities import ReviewableDocument
from ...domain.exceptions import RejectionRequiresNote
from ...domain.value_objects import ValidationStatus
from ..dto import CertificationOutput, OperatorLicenseOutput, ReviewDocumentInput


class ReviewDocumentUseCase(ABC):
    """Escrito uma vez. Antes: views.py:224-255 e :258-289, iguais byte a byte."""

    def __init__(self, repository, unit_of_work):
        self._repository = repository
        self._uow = unit_of_work

    def execute(self, data: ReviewDocumentInput):
        target = self._parse_status(data.validation_status)

        with self._uow:
            document = self._repository.get_by_id(data.document_id)
            self._apply(document, target, data.review_note)
            saved = self._repository.save(document)

        return self._present(saved)

    # ── Passos fixos ─────────────────────────────────────────────────────
    @staticmethod
    def _parse_status(raw: str) -> ValidationStatus:
        try:
            status = ValidationStatus(raw)
        except ValueError:
            raise RejectionRequiresNote(
                "Informe um validation_status válido (approved ou rejected)."
            ) from None
        if status not in ValidationStatus.reviewable_targets():
            raise RejectionRequiresNote(
                "Informe um validation_status válido (approved ou rejected)."
            )
        return status

    @staticmethod
    def _apply(document: ReviewableDocument, target, note) -> None:
        if target is ValidationStatus.APPROVED:
            document.approve()
        else:
            document.reject(note)

    # ── Passo variável ───────────────────────────────────────────────────
    @abstractmethod
    def _present(self, document): ...


class ReviewLicenseUseCase(ReviewDocumentUseCase):
    def _present(self, document):
        return OperatorLicenseOutput.from_entity(document, today=date.today())


class ReviewCertificationUseCase(ReviewDocumentUseCase):
    def _present(self, document):
        return CertificationOutput.from_entity(document)
```

Note que os status válidos vêm de `ValidationStatus.reviewable_targets()` — não do literal
`VALID_STATUSES = {"approved", "rejected"}` de `views.py:222`.

### `application/use_cases/validate_cnh_file.py`

```python
from ...domain.value_objects import ClassificationResult, DocumentFile
from ..validators import default_upload_chain


class ValidateCnhFileUseCase:
    def __init__(self, classifier, validator=None):
        self._classifier = classifier            # porta, não implementação
        self._validator = validator or default_upload_chain()

    def execute(self, file: DocumentFile | None) -> ClassificationResult:
        self._validator.validate(file)
        return self._classifier.classify(file)
```

Sete linhas. A versão atual (`views.py:14-48`) tem 35, e nenhuma delas é testável sem TensorFlow.

### `application/use_cases/store_document.py`

```python
from ...domain.value_objects import DocumentFile
from ..validators import default_upload_chain


class StoreDocumentUseCase:
    FOLDER = "documents"

    def __init__(self, storage, validator=None):
        self._storage = storage
        self._validator = validator or default_upload_chain()

    def execute(self, file: DocumentFile | None) -> str:
        self._validator.validate(file)
        return self._storage.save(file, folder=self.FOLDER)
```

### `application/use_cases/list_documents.py`

```python
from datetime import date

from ...domain.value_objects import ValidationStatus
from ..dto import ListDocumentsInput, OperatorLicenseOutput


class ListLicensesUseCase:
    def __init__(self, repository):
        self._repository = repository

    def execute(self, data: ListDocumentsInput) -> list[OperatorLicenseOutput]:
        status = ValidationStatus(data.validation_status) if data.validation_status else None
        today = date.today()
        return [
            OperatorLicenseOutput.from_entity(e, today=today)
            for e in self._repository.find(user_id=data.user_id, validation_status=status)
        ]
```

---

## Camada 3 — `infrastructure/`

### `infrastructure/models.py`

```python
from django.db import models

from core.models import UUIDTimeStampedModel


class OperatorLicenseModel(UUIDTimeStampedModel):
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
    category = models.CharField(max_length=2)
    first_license_date = models.DateField()
    issue_date = models.DateField()
    expiration_date = models.DateField()
    issuing_state = models.CharField(max_length=2)
    issuing_authority = models.CharField(max_length=255)

    situation = models.CharField(max_length=20)
    acc = models.BooleanField(default=False)
    ear = models.BooleanField(default=False)

    medical_restrictions = models.TextField(blank=True, null=True)
    observations = models.TextField(blank=True, null=True)
    points = models.IntegerField(default=0)

    file_url = models.CharField(max_length=1024, blank=True, null=True)
    validation_status = models.CharField(max_length=10, default="pending")
    review_note = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "operator_licenses"


class CertificationModel(UUIDTimeStampedModel):
    user = models.ForeignKey("users.Users", models.CASCADE)

    issuing_organization = models.CharField(max_length=255)
    institution = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    issue_date = models.DateField()
    expiration_date = models.DateField(blank=True, null=True)
    credential_code = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField()

    media_url = models.CharField(max_length=1024, blank=True, null=True)
    validation_status = models.CharField(max_length=10, default="pending")
    review_note = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "certifications"
```

> As `TextChoices` saem do model: a fonte de verdade dos valores válidos passa a ser o enum de
> domínio. O model só precisa armazenar. Manter `choices` aqui duplicaria a regra.

### `infrastructure/mappers.py` — Data Mapper

```python
from ..domain.entities import Certification, OperatorLicense
from ..domain.value_objects import (
    BirthPlace, CPF, CnhCategory, CnhNumber, CnhSituation, ValidationStatus,
)
from .models import CertificationModel, OperatorLicenseModel


class OperatorLicenseMapper:
    """Único ponto que conhece as duas representações."""

    @staticmethod
    def to_entity(m: OperatorLicenseModel) -> OperatorLicense:
        return OperatorLicense(
            id=m.id,
            user_id=m.user_id,
            validation_status=ValidationStatus(m.validation_status),
            review_note=m.review_note,
            file_url=m.file_url,
            name=m.name,
            birth_date=m.birth_date,
            cpf=CPF(m.cpf),
            rg=m.rg,
            mother_name=m.mother_name,
            father_name=m.father_name,
            nationality=m.nationality,
            birth_place=BirthPlace.parse(m.birth_place),
            cnh_number=CnhNumber(m.cnh_number),
            category=CnhCategory(m.category),
            first_license_date=m.first_license_date,
            issue_date=m.issue_date,
            expiration_date=m.expiration_date,
            issuing_state=m.issuing_state,
            issuing_authority=m.issuing_authority,
            situation=CnhSituation(m.situation),
            acc=m.acc,
            ear=m.ear,
            medical_restrictions=m.medical_restrictions,
            observations=m.observations,
            points=m.points,
        )

    @staticmethod
    def to_model(e: OperatorLicense, m: OperatorLicenseModel | None = None):
        m = m or OperatorLicenseModel(id=e.id)
        m.user_id = e.user_id
        m.validation_status = e.validation_status.value
        m.review_note = e.review_note
        m.file_url = e.file_url
        m.name = e.name
        m.birth_date = e.birth_date
        m.cpf = str(e.cpf)
        m.rg = e.rg
        m.mother_name = e.mother_name
        m.father_name = e.father_name
        m.nationality = e.nationality
        m.birth_place = str(e.birth_place)
        m.cnh_number = str(e.cnh_number)
        m.category = e.category.value
        m.first_license_date = e.first_license_date
        m.issue_date = e.issue_date
        m.expiration_date = e.expiration_date
        m.issuing_state = e.issuing_state
        m.issuing_authority = e.issuing_authority
        m.situation = e.situation.value
        m.acc = e.acc
        m.ear = e.ear
        m.medical_restrictions = e.medical_restrictions
        m.observations = e.observations
        m.points = e.points
        return m


class CertificationMapper:
    @staticmethod
    def to_entity(m: CertificationModel) -> Certification:
        return Certification(
            id=m.id,
            user_id=m.user_id,
            validation_status=ValidationStatus(m.validation_status),
            review_note=m.review_note,
            file_url=m.media_url,
            issuing_organization=m.issuing_organization,
            institution=m.institution,
            title=m.title,
            issue_date=m.issue_date,
            expiration_date=m.expiration_date,
            credential_code=m.credential_code,
            description=m.description,
        )

    @staticmethod
    def to_model(e: Certification, m: CertificationModel | None = None):
        m = m or CertificationModel(id=e.id)
        m.user_id = e.user_id
        m.validation_status = e.validation_status.value
        m.review_note = e.review_note
        m.media_url = e.file_url
        m.issuing_organization = e.issuing_organization
        m.institution = e.institution
        m.title = e.title
        m.issue_date = e.issue_date
        m.expiration_date = e.expiration_date
        m.credential_code = e.credential_code
        m.description = e.description
        return m
```

Este arquivo **é** o custo do Data Mapper, declarado em [ADR-002](../06-adr.md). Em troca, tudo acima
dele roda sem banco.

### `infrastructure/repositories.py`

```python
from uuid import UUID

from ..domain.entities import OperatorLicense
from ..domain.exceptions import DocumentNotFound
from ..domain.repositories import CertificationRepository, OperatorLicenseRepository
from ..domain.value_objects import ValidationStatus
from .mappers import CertificationMapper, OperatorLicenseMapper
from .models import CertificationModel, OperatorLicenseModel


class DjangoOperatorLicenseRepository(OperatorLicenseRepository):
    def get_by_id(self, document_id: UUID) -> OperatorLicense:
        try:
            model = OperatorLicenseModel.objects.get(pk=document_id)
        except OperatorLicenseModel.DoesNotExist:
            raise DocumentNotFound(document_id=str(document_id)) from None
        return OperatorLicenseMapper.to_entity(model)

    def save(self, license: OperatorLicense) -> OperatorLicense:
        model = OperatorLicenseModel.objects.filter(pk=license.id).first()
        model = OperatorLicenseMapper.to_model(license, model)
        model.save()
        return OperatorLicenseMapper.to_entity(model)

    def delete(self, document_id: UUID) -> None:
        deleted, _ = OperatorLicenseModel.objects.filter(pk=document_id).delete()
        if not deleted:
            raise DocumentNotFound(document_id=str(document_id))

    def find(self, *, user_id=None, validation_status=None) -> list[OperatorLicense]:
        qs = OperatorLicenseModel.objects.all()
        if user_id:
            qs = qs.filter(user_id=user_id)
        if validation_status:
            qs = qs.filter(validation_status=validation_status.value)
        qs = qs.order_by("-created_at", "-id")
        return [OperatorLicenseMapper.to_entity(m) for m in qs]


class DjangoCertificationRepository(CertificationRepository):
    def get_by_id(self, document_id: UUID):
        try:
            model = CertificationModel.objects.get(pk=document_id)
        except CertificationModel.DoesNotExist:
            raise DocumentNotFound(document_id=str(document_id)) from None
        return CertificationMapper.to_entity(model)

    def save(self, certification):
        model = CertificationModel.objects.filter(pk=certification.id).first()
        model = CertificationMapper.to_model(certification, model)
        model.save()
        return CertificationMapper.to_entity(model)

    def delete(self, document_id: UUID) -> None:
        deleted, _ = CertificationModel.objects.filter(pk=document_id).delete()
        if not deleted:
            raise DocumentNotFound(document_id=str(document_id))

    def find(self, *, user_id=None, validation_status=None):
        qs = CertificationModel.objects.all()
        if user_id:
            qs = qs.filter(user_id=user_id)
        if validation_status:
            qs = qs.filter(validation_status=validation_status.value)
        return [CertificationMapper.to_entity(m) for m in qs.order_by("-created_at", "-id")]
```

### `infrastructure/unit_of_work.py`

```python
from django.db import transaction

from ..application.ports import UnitOfWork


class DjangoUnitOfWork(UnitOfWork):
    def __init__(self):
        self._atomic = None

    def __enter__(self):
        self._atomic = transaction.atomic()
        self._atomic.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        self._atomic.__exit__(exc_type, exc, tb)
```

### `infrastructure/classifier.py`

```python
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings

from ..application.ports import DocumentClassifier
from ..domain.exceptions import ServiceUnavailableError
from ..domain.value_objects import ClassificationResult, DocumentFile

logger = logging.getLogger(__name__)


class SubprocessCnhClassifier(DocumentClassifier):
    """Adapter para o modelo TensorFlow que roda em venv Python 3.13 separada."""

    def __init__(self, ml_dir: Path | None = None):
        self._ml_dir = ml_dir or settings.BASE_DIR / "ml"

    @property
    def _python(self) -> Path:
        # Corrige o caminho fixo POSIX de cnh_classifier.py:11
        venv = self._ml_dir / "venv"
        return venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    def classify(self, file: DocumentFile) -> ClassificationResult:
        self._check_setup()
        suffix = ".pdf" if file.content_type == "application/pdf" else ".jpg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(file.read())
            tmp.flush()
            try:
                proc = subprocess.run(
                    [str(self._python), str(self._ml_dir / "classify.py"), tmp.name],
                    capture_output=True, text=True, timeout=30,
                )
            except subprocess.TimeoutExpired:
                return ClassificationResult(False, "low", 0.0, "Tempo limite excedido.")

        if proc.returncode != 0:
            logger.error("classify.py falhou: %s", proc.stderr)
            return ClassificationResult(False, "low", 0.0, "Erro ao processar o documento.")

        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError:
            logger.error("Saída inválida de classify.py: %s", proc.stdout[:200])
            return ClassificationResult(False, "low", 0.0, "Erro ao processar o documento.")

        return ClassificationResult(
            is_valid=payload["is_valid"],
            confidence=payload["confidence"],
            score=payload["score"],
        )

    def _check_setup(self) -> None:
        if not self._python.exists():
            raise ServiceUnavailableError(
                f"Venv do ML não encontrado em {self._python}."
            )


class StubClassifier(DocumentClassifier):
    """Para testes. É isto que torna o caso de uso testável sem TensorFlow."""

    def __init__(self, result: ClassificationResult | None = None):
        self._result = result or ClassificationResult(True, "high", 0.97)

    def classify(self, file: DocumentFile) -> ClassificationResult:
        return self._result


class LoggingClassifier(DocumentClassifier):
    """Decorator. Separa observabilidade de inferência."""

    def __init__(self, inner: DocumentClassifier):
        self._inner = inner

    def classify(self, file: DocumentFile) -> ClassificationResult:
        logger.info("Classificando %s (%d bytes)", file.name, file.size)
        result = self._inner.classify(file)
        logger.info("Resultado: valid=%s score=%.3f", result.is_valid, result.score)
        return result
```

> **Nota:** `_python` corrige de passagem o caminho fixo POSIX de `cnh_classifier.py:11`, que hoje
> impede rodar o back-end no Windows.

### `infrastructure/storage.py`

```python
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from ..application.ports import FileStorage
from ..domain.value_objects import DocumentFile


class DjangoFileStorage(FileStorage):
    """Convenção única de upload — hoje há duas mecânicas incompatíveis
    (views.py:204-219 usa open(); postings/views.py usa default_storage)."""

    def save(self, file: DocumentFile, *, folder: str) -> str:
        import uuid
        from pathlib import Path

        ext = Path(file.name).suffix.lower() or ".jpg"
        path = default_storage.save(f"{folder}/{uuid.uuid4()}{ext}", ContentFile(file.read()))
        return default_storage.url(path)
```

---

## Camada 3 — `interfaces/`

### `interfaces/serializers.py`

```python
from rest_framework import serializers


class ReviewDocumentSerializer(serializers.Serializer):
    """Só forma dos dados. Regra de negócio mora no domínio."""

    validation_status = serializers.CharField()
    review_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class OperatorLicenseOutputSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user = serializers.UUIDField()
    name = serializers.CharField()
    cpf = serializers.CharField()
    cnh_number = serializers.CharField()
    category = serializers.CharField()
    expiration_date = serializers.DateField(allow_null=True)
    situation = serializers.CharField()
    points = serializers.IntegerField()
    file_url = serializers.CharField(allow_null=True)
    validation_status = serializers.CharField()
    review_note = serializers.CharField(allow_null=True)
    enables_operation = serializers.BooleanField()


class CertificationOutputSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user = serializers.UUIDField()
    issuing_organization = serializers.CharField()
    institution = serializers.CharField()
    title = serializers.CharField()
    issue_date = serializers.DateField(allow_null=True)
    expiration_date = serializers.DateField(allow_null=True)
    credential_code = serializers.CharField(allow_null=True)
    description = serializers.CharField()
    media_url = serializers.CharField(allow_null=True)
    validation_status = serializers.CharField()
    review_note = serializers.CharField(allow_null=True)
```

Sem `create()`, sem `update()`, sem `uuid.uuid4()`, sem timestamps. Um serializer volta a ser um DTO.

### `interfaces/containers.py` — composition root

```python
from functools import lru_cache

from ..application.use_cases.list_documents import ListLicensesUseCase
from ..application.use_cases.review_document import (
    ReviewCertificationUseCase, ReviewLicenseUseCase,
)
from ..application.use_cases.store_document import StoreDocumentUseCase
from ..application.use_cases.validate_cnh_file import ValidateCnhFileUseCase
from ..infrastructure.classifier import LoggingClassifier, SubprocessCnhClassifier
from ..infrastructure.repositories import (
    DjangoCertificationRepository, DjangoOperatorLicenseRepository,
)
from ..infrastructure.storage import DjangoFileStorage
from ..infrastructure.unit_of_work import DjangoUnitOfWork


class Container:
    """Único módulo do sistema que conhece as quatro camadas ao mesmo tempo."""

    @lru_cache(maxsize=1)
    def license_repository(self):
        return DjangoOperatorLicenseRepository()

    @lru_cache(maxsize=1)
    def certification_repository(self):
        return DjangoCertificationRepository()

    @lru_cache(maxsize=1)
    def classifier(self):
        return LoggingClassifier(SubprocessCnhClassifier())

    def review_license(self):
        return ReviewLicenseUseCase(self.license_repository(), DjangoUnitOfWork())

    def review_certification(self):
        return ReviewCertificationUseCase(self.certification_repository(), DjangoUnitOfWork())

    def validate_cnh_file(self):
        return ValidateCnhFileUseCase(self.classifier())

    def store_document(self):
        return StoreDocumentUseCase(DjangoFileStorage())

    def list_licenses(self):
        return ListLicensesUseCase(self.license_repository())


container = Container()
```

### `interfaces/views.py`

```python
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..application.dto import ListDocumentsInput, ReviewDocumentInput
from ..domain.value_objects import DocumentFile
from .containers import container
from .serializers import (
    CertificationOutputSerializer,
    OperatorLicenseOutputSerializer,
    ReviewDocumentSerializer,
)


def _to_document_file(uploaded) -> DocumentFile | None:
    if uploaded is None:
        return None
    return DocumentFile(
        name=uploaded.name,
        content_type=uploaded.content_type,
        size=uploaded.size,
        read=uploaded.read,
    )


@api_view(["PATCH"])
def review_license(request, pk):
    payload = ReviewDocumentSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    output = container.review_license().execute(
        ReviewDocumentInput(document_id=pk, **payload.validated_data)
    )
    return Response(OperatorLicenseOutputSerializer(output).data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
def review_certification(request, pk):
    payload = ReviewDocumentSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    output = container.review_certification().execute(
        ReviewDocumentInput(document_id=pk, **payload.validated_data)
    )
    return Response(CertificationOutputSerializer(output).data, status=status.HTTP_200_OK)


@api_view(["POST"])
def validate_cnh_document(request):
    result = container.validate_cnh_file().execute(_to_document_file(request.FILES.get("file")))
    return Response(result.__dict__, status=status.HTTP_200_OK)


@api_view(["POST"])
def upload_document(request):
    url = container.store_document().execute(_to_document_file(request.FILES.get("file")))
    return Response({"url": url}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def operator_licenses_list(request):
    outputs = container.list_licenses().execute(
        ListDocumentsInput(
            user_id=request.query_params.get("user"),
            validation_status=request.query_params.get("validation_status"),
        )
    )
    return Response(OperatorLicenseOutputSerializer(outputs, many=True).data)
```

**Nenhum `try/except`.** Erros de domínio sobem e o `domain_exception_handler` os traduz. As duas
funções de review continuam separadas porque são endpoints distintos — mas agora são 6 linhas cada, e
a lógica compartilhada vive em um único lugar.

---

## Testes

### `tests/fakes.py`

```python
from uuid import UUID

from ..domain.exceptions import DocumentNotFound
from ..domain.repositories import OperatorLicenseRepository


class InMemoryOperatorLicenseRepository(OperatorLicenseRepository):
    def __init__(self, seed=None):
        self._items = {e.id: e for e in (seed or [])}

    def get_by_id(self, document_id: UUID):
        try:
            return self._items[document_id]
        except KeyError:
            raise DocumentNotFound(document_id=str(document_id)) from None

    def save(self, license):
        self._items[license.id] = license
        return license

    def delete(self, document_id: UUID) -> None:
        self._items.pop(document_id, None)

    def find(self, *, user_id=None, validation_status=None):
        return [
            e for e in self._items.values()
            if (user_id is None or e.user_id == user_id)
            and (validation_status is None or e.validation_status is validation_status)
        ]


class FakeUnitOfWork:
    def __enter__(self): return self
    def __exit__(self, *a): return None
```

### `tests/test_entities.py` — sem Django

```python
from datetime import date
from uuid import uuid4

import pytest

from ..domain.entities import OperatorLicense
from ..domain.exceptions import DocumentAlreadyReviewed, RejectionRequiresNote
from ..domain.value_objects import CnhSituation, ValidationStatus


def _license(**kw) -> OperatorLicense:
    return OperatorLicense(id=uuid4(), user_id=uuid4(), **kw)


def test_rejeicao_sem_justificativa_falha():
    with pytest.raises(RejectionRequiresNote):
        _license().reject("   ")


def test_aprovacao_limpa_a_nota():
    lic = _license(review_note="pendência anterior")
    lic.approve()
    assert lic.validation_status is ValidationStatus.APPROVED
    assert lic.review_note is None


def test_nao_revisa_duas_vezes():
    lic = _license()
    lic.approve()
    with pytest.raises(DocumentAlreadyReviewed):
        lic.reject("motivo")


def test_cnh_vencida_nao_habilita():
    lic = _license(expiration_date=date(2020, 1, 1))
    lic.approve()
    assert lic.enables_operation(date(2026, 6, 1)) is False


def test_cnh_suspensa_nao_habilita():
    lic = _license(expiration_date=date(2030, 1, 1), situation=CnhSituation.SUSPENDED)
    lic.approve()
    assert lic.enables_operation(date(2026, 6, 1)) is False
```

Estes testes rodam **sem banco, sem Django, sem TensorFlow** — em milissegundos. Hoje seriam
impossíveis: a mesma regra vive dentro de uma view HTTP.

### `tests/test_use_cases.py`

```python
from uuid import uuid4

import pytest

from ..application.dto import ReviewDocumentInput
from ..application.use_cases.review_document import ReviewLicenseUseCase
from ..application.use_cases.validate_cnh_file import ValidateCnhFileUseCase
from ..domain.entities import OperatorLicense
from ..domain.exceptions import DocumentNotFound, UnsupportedFileType
from ..domain.value_objects import ClassificationResult, DocumentFile, ValidationStatus
from ..infrastructure.classifier import StubClassifier
from .fakes import FakeUnitOfWork, InMemoryOperatorLicenseRepository


def test_review_aprova_e_persiste():
    lic = OperatorLicense(id=uuid4(), user_id=uuid4())
    repo = InMemoryOperatorLicenseRepository([lic])

    output = ReviewLicenseUseCase(repo, FakeUnitOfWork()).execute(
        ReviewDocumentInput(document_id=lic.id, validation_status="approved")
    )

    assert output.validation_status == "approved"
    assert repo.get_by_id(lic.id).validation_status is ValidationStatus.APPROVED


def test_review_de_documento_inexistente():
    use_case = ReviewLicenseUseCase(InMemoryOperatorLicenseRepository(), FakeUnitOfWork())
    with pytest.raises(DocumentNotFound):
        use_case.execute(ReviewDocumentInput(document_id=uuid4(), validation_status="approved"))


def test_validacao_rejeita_tipo_nao_suportado():
    use_case = ValidateCnhFileUseCase(StubClassifier())
    arquivo = DocumentFile(name="x.txt", content_type="text/plain", size=10, read=lambda: b"")
    with pytest.raises(UnsupportedFileType):
        use_case.execute(arquivo)


def test_validacao_delega_ao_classificador():
    esperado = ClassificationResult(True, "high", 0.99)
    use_case = ValidateCnhFileUseCase(StubClassifier(esperado))
    arquivo = DocumentFile(name="cnh.jpg", content_type="image/jpeg", size=1024, read=lambda: b"")
    assert use_case.execute(arquivo) == esperado
```

---

## Resultado

| | Antes | Depois |
|---|---|---|
| `views.py` | 289 linhas, 5 responsabilidades | ~60 linhas, só HTTP |
| Duplicação | ~230 linhas em 3 pares | 0 |
| Fonte dos status | Literal em `views.py:222` | `ValidationStatus` |
| Regra "rejeição exige nota" | `views.py:239-243` **e** `:273-277` | `ReviewableDocument.reject()` |
| Testes sem banco | Impossível | 9 testes |
| Testes sem TensorFlow | Impossível | Todos |
| Novo tipo de documento | 3 pares de funções copiados | 1 subclasse |
| Escrita transacional | Não | Unit of Work |

Verificação da Regra da Dependência:

```bash
grep -rE "^(from|import) (django|rest_framework)" BackEnd/document_validation/domain/ \
                                                   BackEnd/document_validation/application/
```
