# Diagrama 3 — Sequência: revisão de documento

`PATCH /api/operator-licenses/<pk>/review` atravessando as quatro camadas.

## Depois da refatoração

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant V as views.py<br/>(C3)
    participant S as ReviewDocumentSerializer<br/>(C3)
    participant CT as containers.py<br/>(C3)
    participant UC as ReviewDocumentUseCase<br/>(C2)
    participant R as DjangoRepository<br/>(C3)
    participant M as Mapper<br/>(C3)
    participant E as OperatorLicense<br/>(C1 · entidade)
    participant DB as PostgreSQL<br/>(C4)

    Admin->>V: PATCH {validation_status, review_note}
    V->>S: valida forma dos dados
    S-->>V: ReviewDocumentInput (DTO)
    V->>CT: review_license_use_case()
    CT-->>V: caso de uso com portas injetadas
    V->>UC: execute(input)

    activate UC
    UC->>R: get_by_id(id)
    R->>DB: SELECT
    DB-->>R: row
    R->>M: to_entity(model)
    M-->>R: entidade de domínio
    R-->>UC: OperatorLicense

    Note over UC,E: A regra de negócio mora na entidade,<br/>não no caso de uso

    alt validation_status = REJECTED
        UC->>E: reject(note)
        activate E
        E->>E: valida justificativa não-vazia
        Note right of E: RejectionRequiresNote<br/>se vazia
        deactivate E
    else validation_status = APPROVED
        UC->>E: approve()
    end

    UC->>R: save(entidade)
    R->>M: to_model(entidade)
    M-->>R: django model
    R->>DB: UPDATE
    deactivate UC

    UC-->>V: DocumentOutput (DTO)
    V-->>Admin: 200 OK
```

## Hoje

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant V as views.py:224-255
    participant DB as PostgreSQL

    Admin->>V: PATCH {validation_status, review_note}
    V->>DB: OperatorLicense.objects.get(pk)
    DB-->>V: model
    V->>V: valida contra VALID_STATUSES (linha 222)
    Note right of V: literal redeclarado, embora<br/>models.py:25-28 já defina<br/>ValidationStatus
    V->>V: se rejeitado e sem nota → 400
    V->>V: import timezone dentro da função
    V->>V: muta o model diretamente
    V->>DB: save(update_fields=[...])
    V-->>Admin: 200 OK
```

## Diferenças que importam

| | Hoje | Depois |
|---|---|---|
| Onde está a regra "rejeição exige justificativa" | `views.py:239-243` — e de novo em `:273-277` | `ReviewableDocument.reject()`, uma vez |
| Testável sem HTTP? | Não | Sim |
| Testável sem banco? | Não | Sim — com `InMemoryRepository` |
| Duplicação | Fluxo inteiro repetido para certificação (`:258-289`) | Um caso de uso, duas subclasses |
| Fonte dos status válidos | Literal em `views.py:222` | `ValidationStatus` no domínio |

O passo mais relevante do diagrama é o `alt`: a decisão de negócio acontece **dentro da entidade**.
O caso de uso apenas orquestra — busca, delega, persiste. Se aparecer um `if` sobre estado de domínio
dentro de um caso de uso, essa regra provavelmente pertence à entidade.
