# 2. Back-end — Django + DRF

## 2.1 Estrutura de um bounded context

```
document_validation/
├── domain/                     # CAMADA 1 — Python puro
│   ├── __init__.py
│   ├── entities.py             # ReviewableDocument (ABC), OperatorLicense, Certification
│   ├── value_objects.py        # CPF, RG, CnhNumber, CnhCategory, ValidationStatus, DocumentFile
│   ├── exceptions.py           # DomainError e subclasses
│   └── repositories.py         # portas: OperatorLicenseRepository, CertificationRepository
│
├── application/                # CAMADA 2 — importa apenas domain
│   ├── ports.py                # DocumentClassifier, FileStorage, UnitOfWork
│   ├── dto.py                  # dataclasses frozen de entrada e saída
│   └── use_cases/
│       ├── review_document.py  # Template Method + 2 subclasses
│       ├── submit_license.py
│       ├── validate_cnh_file.py
│       └── store_document.py
│
├── infrastructure/             # CAMADA 3 — persistência e integrações
│   ├── models.py               # models do Django — só persistência
│   ├── mappers.py              # Data Mapper: entidade <-> model
│   ├── repositories.py         # DjangoOperatorLicenseRepository
│   ├── unit_of_work.py         # DjangoUnitOfWork
│   ├── classifier.py           # SubprocessCnhClassifier, StubClassifier
│   └── storage.py              # DjangoFileStorage
│
├── interfaces/                 # CAMADA 3 — entrega
│   ├── views.py                # DRF fino
│   ├── serializers.py          # parsing de request / render de response
│   ├── containers.py           # composition root
│   └── urls.py
│
├── migrations/
└── tests/
    ├── test_entities.py        # sem Django
    ├── test_use_cases.py       # sem Django, com fakes
    └── test_views.py           # com Django
```

## 2.2 Regras de import

A tabela abaixo é a arquitetura. Se um import a viola, o problema é o import, não a tabela.

| Módulo | Pode importar | **Nunca** pode importar |
|---|---|---|
| `domain/` | stdlib, outros módulos de `domain/` | `django`, `rest_framework`, `infrastructure`, `application`, `interfaces` |
| `application/` | `domain/`, stdlib | `django`, `rest_framework`, `infrastructure`, `interfaces` |
| `infrastructure/` | `domain/`, `application/`, `django` | `interfaces` |
| `interfaces/` | tudo | — |

Verificação, que deve fazer parte do checklist de PR:

```bash
grep -rE "^(from|import) (django|rest_framework)" BackEnd/*/domain/ BackEnd/*/application/
```

Saída vazia = arquitetura íntegra.

**Contextos não importam uns aos outros.** Comunicação entre bounded contexts acontece por eventos
de domínio (ver [ADR-005](06-adr.md)), nunca por import direto de models.

## 2.3 Responsabilidade por arquivo

### `domain/entities.py`

Entidades com comportamento. A regra de negócio mora **aqui**, não no caso de uso.

```python
@dataclass
class ReviewableDocument(ABC):
    id: UUID
    user_id: UUID
    validation_status: ValidationStatus
    review_note: str | None = None

    def approve(self) -> None:
        self._guard_reviewable()
        self.validation_status = ValidationStatus.APPROVED
        self.review_note = None

    def reject(self, note: str) -> None:
        self._guard_reviewable()
        if not note or not note.strip():
            raise RejectionRequiresNote()
        self.validation_status = ValidationStatus.REJECTED
        self.review_note = note.strip()
```

`RejectionRequiresNote` substitui a validação inline em `views.py:239-243`. A diferença que importa:
a regra agora é testável sem HTTP, sem banco e sem Django.

### `domain/value_objects.py`

Objetos imutáveis (`@dataclass(frozen=True)`) que se auto-validam na construção. Um `CPF` inválido
**não pode existir** — o construtor levanta exceção.

Isso substitui a validação espalhada e resolve o problema dos literais soltos: hoje `'banned'`,
`'active'`, `'pending_signatures'`, `'cancelled'` e `'inactive'` aparecem como strings cruas em
`administration/views.py`, sem nenhum enum por trás.

### `domain/repositories.py`

Portas de persistência — ABCs. Declaradas **pelo domínio**, implementadas pela infraestrutura. É
esta inversão que permite trocar Django por um dicionário em memória nos testes.

### `application/use_cases/`

Um arquivo por caso de uso, um método `execute()`. Recebem portas por construtor.

O caso de uso **orquestra**; ele não decide regra de negócio. Se aparecer um `if` sobre estado do
domínio dentro de um caso de uso, essa regra provavelmente pertence à entidade.

### `application/dto.py`

`@dataclass(frozen=True)` de entrada e saída. Isolam a assinatura do caso de uso das mudanças de API.

### `infrastructure/models.py`

Models do Django, agora **exclusivamente persistência**. Sem regra de negócio, sem `create()`
customizado. Herdam de `core.models.UUIDTimeStampedModel` (Layer Supertype).

### `infrastructure/mappers.py`

Data Mapper. Duas funções por entidade: `to_entity(model)` e `to_model(entity)`. É o único lugar que
conhece as duas representações.

### `infrastructure/repositories.py`

Implementam as portas do domínio usando ORM + mappers. Retornam **entidades**, nunca models. Se um
model do Django vaza de um repositório, o encapsulamento falhou.

### `interfaces/views.py`

HTTP e nada mais: parse → delega → serializa → responde. Meta: ~10 linhas por endpoint.

```python
@api_view(["PATCH"])
def review_license(request, pk):
    dto = ReviewDocumentInput(document_id=pk, **ReviewDocumentSerializer(data=request.data).validated())
    output = container.review_license_use_case().execute(dto)
    return Response(OperatorLicenseSerializer(output).data, status=status.HTTP_200_OK)
```

Views **não** tratam erro de domínio. Exceções sobem e o exception handler de `core/` as traduz em
código HTTP — ver §2.5.

### `interfaces/containers.py`

Composition root. Único lugar autorizado a conhecer todas as camadas e instanciar adaptadores
concretos. É onde a Injeção de Dependência acontece de fato.

## 2.4 O app `core/`

Compartilhado entre contextos:

```
core/
├── models.py           # UUIDTimeStampedModel (Layer Supertype)
├── exceptions.py       # DomainError e a hierarquia base
├── exception_handler.py# DomainError -> resposta HTTP
├── permissions.py      # IsAdministrator, IsOwner, IsOperator
├── events.py           # EventBus (Observer)
└── pagination.py
```

### `UUIDTimeStampedModel`

```python
class UUIDTimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

Isso elimina um bloco copiado em quatro serializers. Hoje `document_validation/serializer.py:42-50`,
`:80-88`, `machines/serializer.py:24-36` e `postings/serializer.py:28-40` repetem:

```python
def create(self, validated_data):
    now = timezone.now()
    return OperatorLicense.objects.create(id=uuid.uuid4(), created_at=now, updated_at=now, **validated_data)
```

Esse código existe **apenas** porque os models não têm defaults — herança do `inspectdb` que gerou
`api/models.py`. Serializer não é lugar de persistência; a correção é no model.

> ⚠️ Requer migration. Por isso é trabalho subsequente, e não parte desta entrega documental.

## 2.5 Tratamento de erros

Hierarquia única no domínio, tradução única na borda.

```python
# core/exceptions.py
class DomainError(Exception):
    code: str = "domain_error"
    http_status: int = 400

class NotFoundError(DomainError):
    code, http_status = "not_found", 404

class ConflictError(DomainError):
    code, http_status = "conflict", 409
```

Registrado uma vez em `settings.py`:

```python
REST_FRAMEWORK = {"EXCEPTION_HANDLER": "core.exception_handler.domain_exception_handler"}
```

O que isso elimina: o bloco `IntegrityError` **copiado três vezes** em `users/views.py`
(linhas 21-27, 62-68 e 77-83), que inspeciona o **texto da mensagem de erro do banco** para adivinhar
qual campo colidiu:

```python
except IntegrityError as e:
    error_msg = str(e).lower()
    if 'email' in error_msg:
        return Response({'email': ['Este e-mail já está em uso.']}, status=409)
```

Isso acopla a aplicação à redação das mensagens do PostgreSQL. Uma atualização do banco pode quebrá-lo
silenciosamente. Com uma constraint de unicidade explícita no repositório levantando
`EmailAlreadyInUse(ConflictError)`, o problema desaparece por construção.

## 2.6 Testes

A divisão que a arquitetura torna possível:

| Nível | O que testa | Precisa de Django? | Precisa de banco? |
|---|---|---|---|
| `test_entities.py` | Regras de negócio | Não | Não |
| `test_use_cases.py` | Orquestração, com fakes | Não | Não |
| `test_views.py` | Contrato HTTP | Sim | Sim |

Test doubles necessários: `InMemoryOperatorLicenseRepository`, `StubClassifier`, `InMemoryFileStorage`.

Situação atual: os seis `tests.py` do projeto têm exatamente 3 linhas cada (o stub gerado pelo
Django). Não há `pytest`, `conftest.py` nem job de CI rodando testes. A arquitetura é pré-requisito
para mudar isso — hoje testar `validate_cnh_document` exigiria TensorFlow instalado na máquina de
quem roda os testes.

---

**Próximo:** [`03-frontend.md`](03-frontend.md) · **Referência:** [`reference/backend-document-validation.md`](reference/backend-document-validation.md)
