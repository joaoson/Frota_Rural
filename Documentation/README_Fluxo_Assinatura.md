# Fluxo da Assinatura Eletrônica — quem chama quem

Este documento descreve o **caminho de execução** da assinatura de contratos: cada
chamada, do clique no navegador até a linha gravada no Postgres, e o que cada função
faz nesse caminho.

O **porquê** de cada decisão (base legal, canonicalização, encadeamento, imutabilidade)
está na Parte 2 de [`README_Arquitetura_Fotos_e_Assinatura.md`](README_Arquitetura_Fotos_e_Assinatura.md).
Aqui o foco é o mapa de chamadas.

---

## 1. Peças envolvidas

| Camada | Arquivo | Papel no fluxo |
| --- | --- | --- |
| Tela de reserva | `FrontEnd/src/pages/Reservar.tsx` | Etapas de pagamento, OTP, aceite e recibo |
| Tela do contrato | `FrontEnd/src/pages/Contrato/Contrato.tsx` | Leitura do contrato + evidência dos aceites |
| Cliente HTTP | `FrontEnd/src/services/ContractService/ContractService.ts` | Único ponto que fala com a API de contratos |
| Rotas | `BackEnd/api/urls.py` | Mapeia as 4 rotas de contrato |
| Views | `BackEnd/api/views.py` | `contract_detail`, `request_signature_otp`, `sign_contract`, `contract_evidence` |
| Documento | `BackEnd/api/contract_document.py` | Monta o dicionário do contrato a partir dos dados reais |
| Evidência | `BackEnd/api/signature_evidence.py` | Hash, encadeamento, verificação e OTP |
| Modelos | `BackEnd/api/models.py` | `Contracts`, `ContractSignatures`, `ContractSignatureOtps` |
| E-mail | `BackEnd/authentication/emailing/email.py` | `send_contract_signature_otp_email` via Resend |
| Banco | `Database/schema.sql` + migração `0002` | Tabelas e triggers append-only |

### Rotas

| Método e rota | View | Chamado por |
| --- | --- | --- |
| `GET /api/contracts/<id>` | `contract_detail` | `getContractById` |
| `POST /api/contracts/<id>/otp` | `request_signature_otp` | `requestSignatureOtp` |
| `POST /api/contracts/<id>/sign` | `sign_contract` | `signContract` |
| `GET /api/contracts/<id>/evidence` | `contract_evidence` | `getContractEvidence` |

> `<id>` aceita **id do contrato ou id do aluguel** — `_get_contract` resolve os dois
> com `Q(pk=pk) | Q(rental_id=pk)`. O frontend trabalha sempre com o id do aluguel.

---

## 2. Visão geral do fluxo

```mermaid
flowchart LR
    A["Reservar.tsx<br/>pagar"] --> B["POST /rentals/<br/>cria Rentals + Contracts"]
    B --> C["GET /contracts/id<br/>preview do contrato"]
    C --> D["Reservar.tsx<br/>solicitarCodigo"]
    D --> E["POST /contracts/id/otp<br/>código por e-mail"]
    E --> F["Reservar.tsx<br/>assinarContrato"]
    F --> G["POST /contracts/id/sign<br/>grava a evidência"]
    G --> H["Recibo na tela<br/>hash, UTC, IP"]
    G --> I["GET /contracts/id/evidence<br/>auditoria posterior"]

    style G fill:#143d0e,color:#ffffff
    style I stroke-dasharray: 5 5
```

O passo `evidence` é o único fora da jornada do usuário: existe para auditoria e ainda
não é chamado por nenhuma tela.

---

## 3. Sequência completa — quem chama quem

```mermaid
sequenceDiagram
    autonumber
    actor U as Locatário
    participant R as Reservar.tsx
    participant S as ContractService.ts
    participant V as api/views.py
    participant D as contract_document.py
    participant E as signature_evidence.py
    participant M as email.py / Resend
    participant DB as Postgres

    Note over U,DB: Etapa 2 — pagamento simulado cria o contrato

    U->>R: pagar
    R->>S: createRental
    S->>V: POST /rentals/
    V->>DB: RentalSerializer.save
    V->>DB: Contracts.objects.create<br/>status = pending_signatures
    V-->>S: 201 rental
    R->>S: getContractById rental.id
    S->>V: GET /contracts/id
    V->>V: _get_contract
    V->>D: build_contract_document
    D-->>V: documento
    V->>E: document_hash
    V-->>R: documento + assinatura + evidencia

    Note over U,DB: Etapa 3 — confirmação de posse do e-mail

    U->>R: solicitarCodigo
    R->>S: requestSignatureOtp role
    S->>V: POST /contracts/id/otp
    V->>V: _party_for_role
    V->>E: generate_otp_code
    V->>E: hash_otp_code code, contract.id
    V->>DB: ContractSignatureOtps.objects.create
    V->>M: send_contract_signature_otp_email
    M-->>U: e-mail com 6 dígitos
    V-->>R: sent_to mascarado + expires_in_seconds

    Note over U,DB: Etapa 3 — aceite

    U->>R: assinarContrato
    R->>R: valida termos, nome e 6 dígitos
    R->>S: signContract id, role, nome, otp
    S->>V: POST /contracts/id/sign
    V->>V: _consume_otp
    V->>DB: marca OTP consumido
    V->>D: build_contract_document
    V->>E: record_signature
    E->>E: document_hash + client_ip + client_user_agent
    E->>DB: SELECT FOR UPDATE última assinatura
    E->>E: record_fingerprint com previous_hash
    E->>DB: INSERT append-only
    E-->>V: ContractSignatures
    V->>DB: atualiza contract e rental
    V-->>S: contrato + signature_evidence
    S->>V: GET /rentals/id
    S-->>R: rental + evidence
    R->>U: recibo com hash, UTC, IP
```

---

## 4. Mapa de chamadas por arquivo

```mermaid
flowchart TD
    subgraph FE["FrontEnd"]
        RES["Reservar.tsx"]
        CTR["Contrato.tsx"]
        SVC["ContractService.ts"]
        RES --> SVC
        CTR --> SVC
    end

    subgraph API["BackEnd — api/views.py"]
        DET["contract_detail"]
        OTP["request_signature_otp"]
        SGN["sign_contract"]
        EVI["contract_evidence"]
        GET["_get_contract"]
        PRT["_party_for_role"]
        CON["_consume_otp"]
        BLK["_signature_block<br/>_evidence_block"]
    end

    subgraph DOC["contract_document.py"]
        BLD["build_contract_document"]
    end

    subgraph SIG["signature_evidence.py"]
        DH["document_hash"]
        CAN["canonical_document"]
        REC["record_signature"]
        FPR["record_fingerprint"]
        VER["verify_chain"]
        GEN["generate_otp_code"]
        HOT["hash_otp_code"]
        IPU["client_ip / client_user_agent"]
    end

    subgraph DBM["models.py + Postgres"]
        CS["ContractSignatures<br/>append-only"]
        CO["ContractSignatureOtps"]
        CC["Contracts / Rentals"]
    end

    MAIL["email.py<br/>send_contract_signature_otp_email"]

    SVC --> DET
    SVC --> OTP
    SVC --> SGN
    SVC --> EVI

    DET --> GET
    DET --> BLD
    DET --> DH
    DET --> BLK

    OTP --> GET
    OTP --> PRT
    OTP --> GEN
    OTP --> HOT
    OTP --> CO
    OTP --> MAIL

    SGN --> GET
    SGN --> CON
    SGN --> PRT
    SGN --> BLD
    SGN --> REC
    SGN --> CC

    CON --> HOT
    CON --> CO

    EVI --> GET
    EVI --> BLD
    EVI --> VER
    EVI --> DH

    REC --> DH
    REC --> IPU
    REC --> FPR
    REC --> CS
    VER --> FPR
    VER --> CS
    DH --> CAN
    FPR --> CAN

    style CS fill:#143d0e,color:#ffffff
```

Duas regras de dependência que o desenho torna visíveis:

- **Todo hash passa por `canonical_document`.** Tanto o hash do documento quanto o do
  registro usam a mesma serialização determinística — se ela mudar, os dois mudam juntos.
- **`record_fingerprint` é usada na gravação e na verificação.** É a mesma função nos
  dois lados; não existe uma versão "de conferência" que possa divergir da original.

---

## 5. O aceite por dentro — `sign_contract`

```mermaid
flowchart TD
    START(["POST /contracts/id/sign"]) --> C1{"contrato existe?"}
    C1 -- não --> E404["404"]
    C1 -- sim --> C2{"role é locador<br/>ou locatario?"}
    C2 -- não --> E400["400"]
    C2 -- sim --> C3{"esta parte<br/>já assinou?"}
    C3 -- sim --> E409["409 conflito"]
    C3 -- não --> C4{"OTP obrigatório<br/>ou código informado?"}
    C4 -- sim --> CO["_consume_otp"]
    CO --> C5{"código válido?"}
    C5 -- não --> E400B["400 com o motivo"]
    C5 -- sim --> SIGNER
    C4 -- não --> SIGNER["define o signatário<br/>request.user tem precedência<br/>sobre _party_for_role"]
    SIGNER --> BUILD["build_contract_document"]
    BUILD --> REC["record_signature<br/>transaction.atomic"]
    REC --> LOCK["SELECT FOR UPDATE<br/>última assinatura do contrato"]
    LOCK --> PREV["previous_hash =<br/>record_hash anterior ou GENESIS"]
    PREV --> INS["INSERT em contract_signatures"]
    INS --> UPD["accepted_by_lessor /<br/>accepted_by_lessee = true"]
    UPD --> C6{"as duas partes<br/>assinaram?"}
    C6 -- sim --> S1["contract.status = signed<br/>rental.status = signed"]
    C6 -- não --> S2["contract.status = pending_signatures<br/>rental.status = active"]
    S1 --> OK(["200 contrato + signature_evidence"])
    S2 --> OK

    style REC fill:#143d0e,color:#ffffff
    style INS fill:#143d0e,color:#ffffff
```

Três pontos que só aparecem lendo o código:

- **O `select_for_update` serializa aceites concorrentes.** Se as duas partes assinarem
  no mesmo instante, a segunda espera a primeira gravar antes de ler o `previous_hash` —
  sem isso, as duas encadeariam a partir do mesmo registro e a cadeia bifurcaria.
- **O cliente não envia nada que vire evidência.** Hash, timestamp, IP e User-Agent são
  todos derivados no servidor; do corpo da requisição só vêm `role`, `name` e `otp`.
- **Um `IntegrityError` na gravação vira 409**, não 500: o `record_hash` é `UNIQUE`, e a
  colisão significa tentativa de gravar a mesma evidência duas vezes.

---

## 6. Ciclo de vida do código OTP

```mermaid
stateDiagram-v2
    [*] --> Pendente: POST /otp grava o code_hash, validade de 10 min
    Pendente --> Pendente: código errado, attempts += 1
    Pendente --> Consumido: código correto, consumed_at = now
    Pendente --> Expirado: expires_at atingido
    Pendente --> Bloqueado: attempts >= 5
    Consumido --> [*]
    Expirado --> [*]: solicite novo código
    Bloqueado --> [*]: solicite novo código
```

Como `_consume_otp` busca sempre o registro **mais recente ainda não consumido**
(`order_by("-created_at").first()`), pedir um novo código na prática invalida o
anterior: o antigo continua na tabela, mas deixa de ser o candidato consultado.

Só o `code_hash` é persistido, salgado com o id do contrato
(`sha256(f"{contract_id}:{code}")`). O valor em claro existe apenas no e-mail.

Parâmetros, em `djangoapi/settings.py`:

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `CONTRACT_SIGNATURE_REQUIRE_OTP` | `true` | Exige o código no aceite |
| `CONTRACT_OTP_TTL_SECONDS` | `600` | Validade do código |
| `CONTRACT_OTP_MAX_ATTEMPTS` | `5` | Tentativas antes de bloquear |

Mesmo com a exigência desligada, um código **informado e errado** recusa a assinatura.

---

## 7. A cadeia de hashes e sua verificação

```mermaid
flowchart LR
    G["GENESIS<br/>0000...0"] --> R1
    subgraph R1["Registro 1 — locatário"]
        P1["previous_hash = GENESIS"]
        H1["record_hash = H conteúdo1 + GENESIS"]
    end
    R1 --> R2
    subgraph R2["Registro 2 — locador"]
        P2["previous_hash = record_hash 1"]
        H2["record_hash = H conteúdo2 + record_hash 1"]
    end
```

`verify_chain(contract, document)` percorre os registros em ordem de `signed_at` e faz
**três conferências por registro**:

```mermaid
flowchart TD
    V(["verify_chain"]) --> A{"previous_hash bate com o<br/>record_hash do anterior?"}
    A -- não --> PA["encadeamento rompido"]
    A -- sim --> B{"record_fingerprint recalculado<br/>== record_hash gravado?"}
    B -- não --> PB["conteúdo alterado após a gravação"]
    B -- sim --> C{"document_hash gravado ==<br/>hash do documento atual?"}
    C -- não --> PC["documento atual não corresponde<br/>ao que foi assinado"]
    C -- sim --> OK["registro íntegro"]
    PA --> OUT
    PB --> OUT
    PC --> OUT
    OK --> OUT(["cadeia_integra + inconsistencias"])
```

A terceira conferência é a que detecta mudança **no cadastro** depois de assinado: se
alguém alterar o modelo do maquinário, o documento muda, o hash muda, e a divergência
aparece — a assinatura segue íntegra, mas deixa de corresponder ao documento atual.

O `record_hash` cobre todos os campos da evidência **mais** o `previous_hash`, então
alterar um IP no registro 1 quebra o `previous_hash` do registro 2 e assim por diante.

---

## 8. Estados do contrato e do aluguel

```mermaid
stateDiagram-v2
    [*] --> pending_signatures: POST /rentals/ cria o contrato
    pending_signatures --> pending_signatures: uma parte assinou, rental vira active
    pending_signatures --> signed: as duas assinaram, rental vira signed
    signed --> [*]
```

| Situação | `contracts.status` | `rentals.status` |
| --- | --- | --- |
| Contrato recém-criado | `pending_signatures` | `pending` |
| Uma parte assinou | `pending_signatures` | `active` |
| As duas assinaram | `signed` | `signed` |

---

## 9. Imutabilidade — duas camadas no caminho da escrita

```mermaid
flowchart TD
    ORM["Código via ORM"] --> L1{"ContractSignatures.save<br/>em registro existente?"}
    L1 -- sim --> X1["ImmutableRecordError"]
    L1 -- não --> DBW["INSERT"]
    PSQL["psql, queryset.update,<br/>migração distraída"] --> L2{"UPDATE ou DELETE em<br/>contract_signatures?"}
    L2 -- sim --> X2["trigger levanta exceção"]
    L2 -- não --> DBW
    DBW --> T["linha gravada"]

    style X1 fill:#8c1d18,color:#ffffff
    style X2 fill:#8c1d18,color:#ffffff
```

A camada do banco existe porque a do modelo só protege quem passa pelo ORM. As triggers
`contract_signatures_no_update` e `contract_signatures_no_delete` são criadas tanto pela
migração `0002` quanto pelo `Database/schema.sql`.

> **Consequência prática:** não dá para apagar assinaturas de teste com `DELETE`. Para
> ensaiar, rode dentro de uma transação e faça rollback; para limpar um banco de
> desenvolvimento, derrube as triggers antes.

---

## 10. O que o servidor devolve em cada rota

| Rota | Campos principais |
| --- | --- |
| `GET /contracts/<id>` | `contrato`, `operacao`, `locador`, `locatario`, `equipamento`, `anuncio`, `assinatura` (datas), `evidencia` (`hash_documento_atual`, `assinaturas[]`) |
| `POST /contracts/<id>/otp` | `sent_to` (e-mail mascarado), `expires_in_seconds` |
| `POST /contracts/<id>/sign` | contrato serializado + `signature_evidence` (registro completo) |
| `GET /contracts/<id>/evidence` | `documento` (versão, hash, algoritmo), `cadeia_integra`, `inconsistencias[]`, `assinaturas[]`, `fundamento_legal` |

O bloco `assinatura` **não entra no hash**: ele muda a cada aceite, e se entrasse cada
parte assinaria um hash diferente do mesmo contrato.

---

## 11. Estado atual da implementação

- **Só o locatário assina pela interface.** A API aceita `role: "locador"` e exige OTP
  também para ele, mas não existe tela — nenhum componente do frontend chama
  `signContract` com `"locador"`. O `_party_for_role` já resolve o locador como
  `contract.rental.postings.machinery.owner`.
- **`GET /contracts/<id>/evidence`** existe no backend e em `getContractEvidence`, mas
  nenhuma tela o consome ainda.
- **`ContractService.signContract` faz uma segunda chamada** (`getRentalById`) logo após
  o aceite, para devolver o aluguel já atualizado junto do recibo.
- **Pagamento é simulado** (`setTimeout` de 1,2 s em `Reservar.tsx`); o contrato é criado
  automaticamente no `POST /rentals/`, independentemente disso.
- **Sem carimbo de tempo de terceiro.** O `signed_at` é do relógio do servidor.
