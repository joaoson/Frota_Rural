# Arquitetura do Frota Rural

Documentação de arquitetura do projeto **Frota Rural** — marketplace de locação de máquinas
agrícolas (PUCPR, Bacharelado em Sistemas de Informação).

Estes documentos definem **onde cada tipo de código deve morar e por quê**. Eles existem porque o
sistema cresceu no modelo "tudo dentro de `views.py`", e esse modelo já cobra seu preço: há
duplicação byte a byte entre endpoints, regras de negócio espalhadas por camadas de transporte HTTP,
e trechos críticos que nenhum teste consegue exercitar.

---

## A regra que governa tudo

> **A Regra da Dependência: dependências de código-fonte apontam apenas para dentro.**
>
> Uma camada interna nunca conhece uma camada externa. O domínio não sabe que Django existe.

Tudo o mais nesta documentação é consequência disso.

```
        ┌─────────────────────────────────────────────┐
        │  4. Frameworks & Drivers                    │
        │     Django · DRF · PostgreSQL · TensorFlow  │
        │   ┌─────────────────────────────────────┐   │
        │   │  3. Interface Adapters              │   │
        │   │     views · repositories · mappers  │   │
        │   │   ┌─────────────────────────────┐   │   │
        │   │   │  2. Use Cases               │   │   │
        │   │   │     regras da aplicação     │   │   │
        │   │   │   ┌─────────────────────┐   │   │   │
        │   │   │   │  1. Entities        │   │   │   │
        │   │   │   │     regras de       │   │   │   │
        │   │   │   │     negócio         │   │   │   │
        │   │   │   └─────────────────────┘   │   │   │
        │   │   └─────────────────────────────┘   │   │
        │   └─────────────────────────────────────┘   │
        └─────────────────────────────────────────────┘

                  dependências ───────►  para dentro
```

| # | Camada | Onde mora (back-end) | Pode importar |
|---|--------|----------------------|---------------|
| 1 | **Entities** — regras de negócio corporativas | `domain/` | Nada. Apenas Python puro |
| 2 | **Use Cases** — regras de negócio da aplicação | `application/` | Camada 1 + suas próprias portas (ABCs) |
| 3 | **Interface Adapters** | `infrastructure/`, `interfaces/` | Camadas 1 e 2 |
| 4 | **Frameworks & Drivers** | Django, DRF, PostgreSQL, TensorFlow, Resend | Tudo |

### O teste de aceitação da Camada 1

A afirmação mais forte — e mais facilmente verificável — desta arquitetura:

```bash
grep -rE "django|rest_framework" BackEnd/document_validation/domain/
```

**Precisa retornar vazio.** Se retornar qualquer coisa, a Regra da Dependência foi violada e a
arquitetura deixou de ser Clean Architecture. Não é uma questão de opinião ou estilo: é um comando
que passa ou falha.

O equivalente no front-end:

```bash
grep -rE "axios|react" FrontEnd/src/features/documents/domain/
```

---

## Ordem de leitura

Para quem está chegando agora, nesta ordem:

| Documento | Para quê |
|---|---|
| [`01-clean-architecture.md`](01-clean-architecture.md) | As quatro camadas e por que o ORM do Django nos obriga ao Data Mapper |
| [`02-backend.md`](02-backend.md) | Responsabilidade de cada arquivo e as regras de import que sustentam a Regra da Dependência |
| [`03-frontend.md`](03-frontend.md) | O espelhamento das camadas em React |
| [`04-pattern-catalog.md`](04-pattern-catalog.md) | Catálogo GoF + Enterprise Patterns: padrão → local → problema resolvido |
| [`05-solid.md`](05-solid.md) | Cada princípio SOLID com a violação real (`arquivo:linha`) e a correção |
| [`06-adr.md`](06-adr.md) | Registros de decisão — inclusive o que foi **rejeitado** e por quê |
| [`07-conventions.md`](07-conventions.md) | Nomenclatura, erros, enums, checklist de PR |

Implementações de referência completas, prontas para copiar:

- [`reference/backend-document-validation.md`](reference/backend-document-validation.md)
- [`reference/frontend-documents-feature.md`](reference/frontend-documents-feature.md)

Diagramas (Mermaid, renderizam direto no GitHub):

- [`diagrams/01-dependency-rule.md`](diagrams/01-dependency-rule.md)
- [`diagrams/02-backend-class-diagram.md`](diagrams/02-backend-class-diagram.md)
- [`diagrams/03-sequence-review-document.md`](diagrams/03-sequence-review-document.md)
- [`diagrams/04-bounded-contexts.md`](diagrams/04-bounded-contexts.md)
- [`diagrams/05-frontend-layers.md`](diagrams/05-frontend-layers.md)

---

## O problema, em um exemplo

Um único par de linhas resume por que esta documentação existe.

`BackEnd/document_validation/models.py:25-28` já declara os status válidos no lugar certo:

```python
class ValidationStatus(models.TextChoices):
    PENDING = 'pending'
    APPROVED = 'approved'
    REJECTED = 'rejected'
```

E `BackEnd/document_validation/views.py:222`, em outro arquivo, redeclara os mesmos valores na mão:

```python
VALID_STATUSES = {"approved", "rejected"}
```

O conhecimento **já existe na camada correta**. A view simplesmente não o consulta. Não é um
problema de disciplina individual — é a ausência de uma fronteira que obrigue a consultá-lo.

O mesmo padrão se repete em escala maior: `views.py` tem 289 linhas, das quais cerca de 230 são
três pares de funções quase idênticas (`review_license` e `review_certification` são iguais byte a
byte, exceto pelo nome do model). Adicionar um terceiro tipo de documento hoje significa copiar e
colar mais três pares.

---

## Estado atual da migração

O back-end **já** foi dividido do app monolítico `api` em apps por domínio — `users`,
`authentication`, `machines`, `postings`, `administration`, `document_validation`. O TODO em
`BackEnd/api/models.py:17-18` registra a intenção do próprio time de fazer `api` deixar de existir.

Ou seja: **os bounded contexts já existem** no nível de app Django. O que não existe é camada
*dentro* de cada app. É isso que esta documentação define.

> **Escopo desta entrega:** documentação. Nenhum arquivo fora de `Documentation/` foi modificado.
> As implementações de referência em `reference/` são código completo e aplicável — a migração do
> código-fonte é trabalho subsequente, feito por módulo, sem conflitar com branches em andamento.

---

## Débito conhecido

Registrado aqui de propósito: são questões **arquiteturais**, não cosméticas, e omiti-las tornaria
esta documentação incompleta.

- Não há `DEFAULT_PERMISSION_CLASSES` em `BackEnd/djangoapi/settings.py`, então o DRF assume
  `AllowAny`. `/api/admin/users/<pk>/ban` e `/api/operator-licenses/<pk>/review` respondem sem
  autenticação. `BackEnd/users/views.py:3-4` importa `IsAuthenticated` e nunca o aplica.
- `role` é `TextField` livre, vai para dentro do JWT e nunca é verificado no servidor.
- `BackEnd/.env` e `FrontEnd/src/.env` estão versionados; o `.gitignore` da raiz cobre apenas
  `FrontEnd/.env`. **`RESEND_API_KEY` e a senha do banco estão no histórico do Git — a chave do
  Resend precisa ser rotacionada.**
- `SECRET_KEY` fixa em `settings.py:29`, reaproveitada como chave de assinatura do JWT; `DEBUG = True`.
- `CommonMiddleware` aparece duas vezes em `MIDDLEWARE` (linhas 59 e 62).
- `FrontEnd/src/.env` está no diretório errado para o Vite e sua chave não tem o prefixo `VITE_`,
  então `AxiosInstance.ts:4` sempre cai no fallback `http://localhost:8000/api/`.
- `FrontEnd/src/main.tsx:43,48` têm comentários `//` como filhos JSX de `<Routes>` — renderizam
  como nós de texto.
