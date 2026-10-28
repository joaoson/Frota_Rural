# Diagrama 2 — Classes de `document_validation`

O módulo piloto nas quatro camadas. Portas em itálico (`<<abstract>>`).

```mermaid
classDiagram
    direction TB

    class ReviewableDocument {
        <<abstract>>
        +UUID id
        +UUID user_id
        +ValidationStatus validation_status
        +str review_note
        +approve() void
        +reject(note: str) void
        #_guard_reviewable() void
    }

    class OperatorLicense {
        +CPF cpf
        +CnhNumber cnh_number
        +CnhCategory category
        +date expiration_date
        +is_expired(today) bool
    }

    class Certification {
        +str issuing_organization
        +str institution
        +date issue_date
    }

    class ValidationStatus {
        <<enumeration>>
        PENDING
        APPROVED
        REJECTED
    }

    class CPF {
        <<value object>>
        +str digits
        +__post_init__() void
    }

    class OperatorLicenseRepository {
        <<abstract>>
        +get_by_id(id) OperatorLicense
        +save(entity) OperatorLicense
        +find_by_user(user_id) list
    }

    class DocumentClassifier {
        <<abstract>>
        +classify(file) ClassificationResult
    }

    class ReviewDocumentUseCase {
        <<abstract>>
        -repository
        +execute(input) DocumentOutput
        #_get_repository()*
    }

    class ReviewLicenseUseCase {
        #_get_repository()
    }

    class ReviewCertificationUseCase {
        #_get_repository()
    }

    class DjangoOperatorLicenseRepository {
        -mapper
        +get_by_id(id) OperatorLicense
        +save(entity) OperatorLicense
    }

    class OperatorLicenseMapper {
        +to_entity(model)$ OperatorLicense
        +to_model(entity)$ Model
    }

    class SubprocessCnhClassifier {
        +classify(file) ClassificationResult
    }

    class StubClassifier {
        +classify(file) ClassificationResult
    }

    class OperatorLicenseModel {
        <<django.Model>>
        +UUIDField id
        +CharField cpf
    }

    ReviewableDocument <|-- OperatorLicense
    ReviewableDocument <|-- Certification
    ReviewableDocument o-- ValidationStatus
    OperatorLicense o-- CPF

    ReviewDocumentUseCase <|-- ReviewLicenseUseCase
    ReviewDocumentUseCase <|-- ReviewCertificationUseCase
    ReviewDocumentUseCase ..> OperatorLicenseRepository : usa porta
    ReviewDocumentUseCase ..> ReviewableDocument : opera sobre

    OperatorLicenseRepository <|.. DjangoOperatorLicenseRepository
    DocumentClassifier <|.. SubprocessCnhClassifier
    DocumentClassifier <|.. StubClassifier

    DjangoOperatorLicenseRepository ..> OperatorLicenseMapper
    OperatorLicenseMapper ..> OperatorLicenseModel
    OperatorLicenseMapper ..> OperatorLicense
```

## Os três padrões visíveis no diagrama

**Template Method.** `ReviewDocumentUseCase` implementa `execute()` uma única vez; as subclasses só
fornecem o repositório. Isso substitui `views.py:224-255` e `:258-289`, hoje **iguais byte a byte**.

**Data Mapper.** `OperatorLicenseMapper` é o único ponto que conhece as duas representações —
`OperatorLicense` (domínio, sem Django) e `OperatorLicenseModel` (`django.Model`). Nenhuma seta liga
a entidade ao model diretamente.

**Strategy.** `SubprocessCnhClassifier` e `StubClassifier` são intercambiáveis por trás de
`DocumentClassifier`. É o que permite testar sem TensorFlow.

## O que o diagrama não mostra

`interfaces/containers.py` — o composition root que instancia
`ReviewLicenseUseCase(DjangoOperatorLicenseRepository(OperatorLicenseMapper()))`. Ele foi omitido
porque se ligaria a todas as classes ao mesmo tempo, poluindo a leitura. É intencional que ele seja
o único módulo com essa característica.
