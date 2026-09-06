# Diagrama 1 — Regra da Dependência

As quatro camadas e o sentido obrigatório das dependências. **Toda seta aponta para dentro.**

```mermaid
flowchart TB
    subgraph L4["CAMADA 4 · Frameworks & Drivers"]
        direction LR
        DJ["Django / DRF"]
        PG[("PostgreSQL")]
        TF["TensorFlow<br/>(venv separada)"]
        RS["Resend"]
    end

    subgraph L3["CAMADA 3 · Interface Adapters"]
        direction LR
        VW["interfaces/views.py"]
        SR["interfaces/serializers.py"]
        CT["interfaces/containers.py<br/><i>composition root</i>"]
        RP["infrastructure/repositories.py"]
        MP["infrastructure/mappers.py"]
        AD["infrastructure/classifier.py"]
    end

    subgraph L2["CAMADA 2 · Use Cases"]
        direction LR
        UC["use_cases/<br/>ReviewDocumentUseCase"]
        PT["ports.py<br/><i>DocumentClassifier, FileStorage</i>"]
        DT["dto.py"]
    end

    subgraph L1["CAMADA 1 · Entities"]
        direction LR
        EN["entities.py<br/>ReviewableDocument"]
        VO["value_objects.py<br/>CPF, ValidationStatus"]
        RI["repositories.py<br/><i>portas de persistência</i>"]
    end

    DJ --> VW
    PG --> RP
    TF --> AD
    RS --> AD

    VW --> UC
    CT --> UC
    RP --> UC
    AD --> PT
    MP --> EN
    RP -.implementa.-> RI

    UC --> EN
    UC --> VO
    UC --> RI
    PT --> VO
    DT --> VO

    classDef l1 fill:#1b4332,stroke:#95d5b2,color:#d8f3dc
    classDef l2 fill:#14213d,stroke:#8ecae6,color:#caf0f8
    classDef l3 fill:#4a3f00,stroke:#ffd166,color:#fff3b0
    classDef l4 fill:#4a1c1c,stroke:#ff8fa3,color:#ffccd5

    class EN,VO,RI l1
    class UC,PT,DT l2
    class VW,SR,CT,RP,MP,AD l3
    class DJ,PG,TF,RS l4
```

## Como ler

- **Nenhuma seta sai da Camada 1.** O domínio não conhece ninguém. É o teste de aceitação:
  `grep -rE "django|rest_framework" BackEnd/*/domain/` deve retornar vazio.
- A seta pontilhada `repositories.py -.implementa.-> repositories.py (domínio)` é a **inversão de
  dependência**: a interface é declarada pela camada interna, e a implementação, que vive fora,
  aponta para dentro ao satisfazê-la.
- `containers.py` é o único módulo que enxerga todas as camadas — por isso é o único que pode
  instanciar adaptadores concretos.

## Comparação com o estado atual

```mermaid
flowchart LR
    subgraph HOJE["Hoje"]
        V1["views.py<br/>289 linhas"]
        V1 --> M1["models.py"]
        V1 --> S1["serializer.py"]
        V1 --> C1["services/cnh_classifier.py"]
        V1 --> OS["os / open / makedirs"]
        M1 --> PG1[("PostgreSQL")]
        C1 --> TF1["subprocess → TensorFlow"]
    end

    classDef hot fill:#4a1c1c,stroke:#ff8fa3,color:#ffccd5
    class V1 hot
```

Uma view depende de tudo, e tudo depende de detalhes. Não existe fronteira que possa ser testada
isoladamente — e é por isso que os seis `tests.py` do projeto continuam com 3 linhas cada.
