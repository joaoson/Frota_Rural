# Diagrama 5 — Camadas do front-end

O mesmo desenho do back-end, espelhado por feature.

```mermaid
flowchart TB
    subgraph P4["CAMADA 4 · Frameworks"]
        AX["axios"]
        RC["React / react-router"]
        BR["Browser API"]
    end

    subgraph P3["CAMADA 3 · Interface Adapters"]
        HR["HttpOperatorLicenseRepository"]
        ZS["schemas.ts<br/><i>zod — Anti-Corruption Layer</i>"]
        MP["mappers.ts"]
        HK["hooks/useOperatorLicense"]
        CP["components/"]
    end

    subgraph P2["CAMADA 2 · Use Cases"]
        UC["useCases/reviewDocument"]
        DT["dto.ts"]
    end

    subgraph P1["CAMADA 1 · Entities"]
        EN["entities.ts<br/>OperatorLicense"]
        VO["valueObjects.ts<br/>CPF, ValidationStatus"]
        RI["repositories.ts<br/><i>interface</i>"]
        ER["errors.ts<br/>DomainError"]
    end

    AX --> HR
    RC --> HK
    RC --> CP
    BR --> HK

    HR --> ZS
    ZS --> MP
    MP --> EN
    HR -.implementa.-> RI
    HK --> UC
    CP --> HK

    UC --> EN
    UC --> RI
    UC --> ER
    DT --> VO

    classDef l1 fill:#1b4332,stroke:#95d5b2,color:#d8f3dc
    classDef l2 fill:#14213d,stroke:#8ecae6,color:#caf0f8
    classDef l3 fill:#4a3f00,stroke:#ffd166,color:#fff3b0
    classDef l4 fill:#4a1c1c,stroke:#ff8fa3,color:#ffccd5

    class EN,VO,RI,ER l1
    class UC,DT l2
    class HR,ZS,MP,HK,CP l3
    class AX,RC,BR l4
```

## A camada que falta hoje

```mermaid
flowchart LR
    subgraph HOJE["Hoje"]
        S1["services/<br/>OperatorDocumentService"]
        GAP[" ⃝ VAZIO "]
        P1["DashboardLocador.tsx<br/><b>2.493 linhas</b>"]
        S1 --> GAP --> P1
    end

    subgraph DEPOIS["Depois"]
        S2["infrastructure/<br/>HttpRepository"]
        H2["presentation/hooks/<br/>useOperatorLicense"]
        C2["components/<br/>apresentacionais"]
        P2["pages/<br/>composição"]
        S2 --> H2 --> C2 --> P2
    end

    classDef bad fill:#4a1c1c,stroke:#ff8fa3,color:#ffccd5
    classDef gap fill:#3d3d3d,stroke:#999,color:#ddd,stroke-dasharray: 5 5
    class P1 bad
    class GAP gap
```

`DashboardLocador.tsx` não tem 2.493 linhas por descuido. Tem porque **não existe lugar entre
"service" e "JSX"** para lógica com estado — 21 `useState`, 11 abas comutadas por `useState<Tab>` e
mutações escritas dentro de handlers JSX (`:1201-1234`, repetido em `:1357-1373` e `:1492`).

O hook é um **Adapter**: converte um caso de uso, que não conhece React, no modelo de estado que o
React entende.

## Fluxo de dados e a Anti-Corruption Layer

```mermaid
flowchart LR
    API[/"API REST<br/>snake_case"/]
    Z["zod schema<br/>valida em runtime"]
    D["DTO tipado"]
    M["mapper"]
    E["entidade de domínio<br/>camelCase + comportamento"]
    H["hook"]
    U["componente"]

    API --> Z --> D --> M --> E --> H --> U

    classDef acl fill:#4a3f00,stroke:#ffd166,color:#fff3b0
    class Z,M acl
```

Dois ganhos concretos:

- O `snake_case` da API **para** na fronteira e nunca vaza para o domínio. Hoje ele atravessa a
  aplicação inteira: `license.birth_date`, `validation_status`, `file_url` aparecem direto no JSX.
- O tipo passa a ser verificado em runtime. Hoje `OperatorLicense` é `type`, apagado na compilação —
  se o back-end mudar um campo, a quebra aparece em produção, não no build.

`zod` já está no `package.json` e nunca foi importado, então isso não adiciona dependência.
