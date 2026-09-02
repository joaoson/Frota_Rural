# 4. Catálogo de Padrões

Cada entrada cita **um problema real do código** e o local. Padrão sem justificativa é *cargo cult*,
e é exatamente o que uma banca cobra — por isso a última seção lista o que foi **rejeitado**.

Legenda: 🔴 corrige um defeito existente · 🟡 estrutural · ⚪ fornecido pelo framework

---

## 4.1 Padrões GoF

### 🔴 Strategy — `DocumentClassifier`

**Problema.** `document_validation/services/cnh_classifier.py` é uma classe concreta com métodos
estáticos que dispara `subprocess` para uma segunda venv Python 3.13 (`ML_PYTHON` fixo em
`venv/bin/python`, linha 11 — caminho POSIX, quebra no Windows). `views.py:35` a importa **no meio da
função**. Consequência direta: **nenhum teste desse endpoint roda sem TensorFlow instalado.**

**Solução.** Porta `DocumentClassifier` em `application/ports.py`; `SubprocessCnhClassifier` e
`StubClassifier` como estratégias intercambiáveis, escolhidas no composition root.

**Ganho.** O caso de uso passa a rodar em milissegundos nos testes. Trocar o modelo de ML — ou migrar
para um serviço HTTP — não toca uma linha de regra de negócio. É o exemplo mais limpo de DIP no
projeto.

### 🔴 Template Method — `ReviewDocumentUseCase`

**Problema.** `views.py:224-255` (`review_license`) e `:258-289` (`review_certification`) são **iguais
byte a byte**, exceto pelo model. O mesmo vale para `operator_licenses_list` (`:51-74`) ≡
`certifications_list` (`:117-140`) e `operator_license_detail` (`:77-114`) ≡ `certification_detail`
(`:143-180`). Cerca de 230 das 289 linhas do arquivo são duplicação.

**Solução.** `ReviewableDocument` (ABC de domínio) define `approve()`/`reject()` uma vez;
`ReviewDocumentUseCase` opera sobre a abstração; as subclasses fornecem apenas o repositório.

**Ganho.** Um terceiro tipo de documento passa a custar uma subclasse em vez de três pares de funções
copiados. É a evidência central de OCP deste projeto.

### 🟡 Adapter

Três ocorrências, todas convertendo interface externa em porta interna:

| Adaptador | Adapta | Porta |
|---|---|---|
| `SubprocessCnhClassifier` | CLI do TensorFlow | `DocumentClassifier` |
| `ResendEmailSender` | SDK do Resend | `EmailSender` |
| `HttpOperatorLicenseRepository` | axios | `OperatorLicenseRepository` (front) |

Os hooks React também são adaptadores: convertem casos de uso, que não conhecem React, no modelo de
estado de componente.

### 🟡 Abstract Factory — composition root

`interfaces/containers.py` é o único módulo autorizado a conhecer as quatro camadas ao mesmo tempo e
montar o grafo de objetos. Produção recebe `SubprocessCnhClassifier` + `DjangoRepository`; testes
recebem `StubClassifier` + `InMemoryRepository`.

Sem ele, cada view instanciaria seus próprios adaptadores concretos e a inversão de dependência
seria apenas decorativa.

### 🟡 Command — casos de uso

Cada caso de uso é um objeto com `execute(input) -> output`, dependências injetadas por construtor.
Torna a operação um valor: passável, decorável, testável isoladamente.

### 🔴 Observer — eventos de domínio

**Problema.** `administration/views.py:6-9` importa models de **quatro** bounded contexts. `ban_user`
(`:55-70`) executa cinco escritas em quatro tabelas de outros contextos. `suspend_user` (`:35-51`) faz
o mesmo em menor escala. Acoplamento máximo: qualquer mudança em `Postings` ou `Rentals` pode quebrar
`administration`.

**Solução.** `administration` publica `UserBanned(user_id)` no `EventBus` de `core/events.py`. Cada
contexto registra seu próprio handler e reage. `administration` deixa de importar models alheios.

**Ganho.** Acoplamento baixo e coesão alta — exatamente os termos do critério de avaliação — de forma
demonstrável no diagrama de componentes ([`diagrams/04`](diagrams/04-bounded-contexts.md)).

No front-end, `AuthContext` já é um Observer: provider notifica consumidores.

### 🔴 Chain of Responsibility — pipeline de validação de arquivo

**Problema.** `views.py:185-202` (`upload_document`) e `:15-32` (`validate_cnh_document`) repetem a
mesma sequência de `if`: arquivo presente → tipo permitido → tamanho máximo. Duas cópias das mesmas
constantes e das mesmas mensagens.

**Solução.** `FileValidator` encadeáveis: `RequiredFileValidator` → `ContentTypeValidator` →
`MaxSizeValidator`. A cadeia é montada uma vez e reutilizada.

**Ganho.** Adicionar uma regra (ex.: rejeitar PDF com mais de N páginas) vira um elo novo, sem tocar
os existentes.

### 🟡 Decorator — `LoggingClassifier`

`LoggingClassifier(DocumentClassifier)` envolve outro `DocumentClassifier` e registra entrada, saída
e latência. Como implementa a mesma porta, entra no lugar do original sem que o caso de uso perceba —
um exemplo direto de LSP.

Hoje o logging está embutido no próprio classificador (`cnh_classifier.py:57`, `:75`), misturando
observabilidade com inferência.

### 🟡 Builder / Specification — filtros de busca de anúncio

`postings/views.py` monta a query inline no ramo GET, incluindo a regra de sobreposição de datas
(`available_from` versus `availability_end`, com `NULL` significando "sem restrição"). Essa regra é
de negócio e está dentro de uma view.

Specifications compostas (`AvailableBetween(...) & HasStatus(...)`) movem a regra para o domínio e a
tornam testável sem banco.

### ⚪ Iterator, ⚪ Proxy

Fornecidos pelo framework: `QuerySet` é iterável e é um proxy preguiçoso da consulta. Citados por
completude — não os implementamos.

---

## 4.2 Enterprise Patterns (Fowler, *PoEAA*)

### 🟡 Data Mapper **versus** Active Record — a decisão central

O ORM do Django é Active Record: o objeto de domínio é o objeto de persistência. Isso viola a Regra
da Dependência, porque obrigaria a entidade a herdar de `models.Model` e, portanto, a Camada 1 a
importar Django.

Adotamos **Data Mapper**: `infrastructure/mappers.py` traduz entre entidade pura e model do ORM.

Custo e ganho estão desenvolvidos em [`01-clean-architecture.md §1.3`](01-clean-architecture.md) e a
decisão registrada em [ADR-002](06-adr.md). **É o ponto que uma banca mais provavelmente vai
questionar** — a resposta é que Clean Architecture sem inversão no acesso a dados é apenas
nomenclatura.

### 🟡 Repository

`OperatorLicenseRepository` (ABC no domínio) + `DjangoOperatorLicenseRepository` +
`InMemoryOperatorLicenseRepository`. Retornam **entidades**, nunca models — se um model vaza, o
encapsulamento falhou.

### 🔴 Unit of Work

**Problema.** `ban_user` executa cinco escritas em quatro tabelas **sem `transaction.atomic`**
(`administration/views.py:61-68`). Uma falha no meio deixa um usuário banido com anúncios ativos e
contratos pendentes. **Isto é um defeito em produção, não um problema de estilo.**

**Solução.** `DjangoUnitOfWork` como context manager; o caso de uso define a fronteira transacional.

### 🟡 Service Layer

A camada `application/use_cases/` é o Service Layer de Fowler: fronteira que define as operações
disponíveis do sistema.

### 🔴 Domain Model **versus** Transaction Script

`administration/views.py` é Transaction Script puro: um procedimento por requisição, com toda a
lógica linear dentro dele e nenhum objeto de domínio.

Isso funciona enquanto as regras são triviais. `ban_user` já não é trivial — tem regras
condicionais, cascata entre contextos e uma transição de estado que ninguém consegue testar sem HTTP.
A migração para Domain Model coloca essa transição na entidade `User`.

### 🟡 Data Transfer Object

Os serializers do DRF viram DTOs de verdade — só forma de dados. Perdem `create()`/`update()`
(`document_validation/serializer.py:42-56`, `:80-93`), que hoje fazem persistência dentro de um
objeto de serialização.

No front, `infrastructure/mappers.ts` converte DTO da API em entidade, impedindo que `snake_case`
vaze para o domínio.

### 🔴 Value Object

**Problema.** Literais de status espalhados sem nenhum enum: `'banned'`, `'active'`, `'suspended'`,
`'warned'`, `'pending_signatures'`, `'cancelled'`, `'inactive'` em `administration/views.py`. E o
caso emblemático: `views.py:222` declara `VALID_STATUSES = {"approved", "rejected"}` embora
`models.py:25-28` já defina `ValidationStatus` como `TextChoices`.

**Solução.** `ValidationStatus`, `CPF`, `RG`, `CnhNumber`, `CnhCategory`, `BirthPlace` como objetos
imutáveis auto-validados. Um `CPF` inválido não consegue existir.

Único contraexemplo positivo hoje: `PostingModeration.ACTION_CHOICES` em `administration/models.py`,
o único lugar do projeto que modela uma constante corretamente.

### 🟡 Layer Supertype

Dois: `ReviewableDocument` (domínio) e `UUIDTimeStampedModel` (persistência). O segundo elimina o
bloco `uuid.uuid4()` + timestamps copiado em quatro serializers.

### 🟡 Gateway

`ResendEmailSender` e `SubprocessCnhClassifier` encapsulam recursos externos. Hoje
`authentication/emailing/email.py` chama o Resend **de forma síncrona dentro do ciclo de requisição**,
com um template HTML de ~95 linhas como f-string e sem tratamento de erro.

### 🟡 Remote Facade / ⚪ Front Controller

A API REST é uma Remote Facade: interface de granularidade grossa sobre objetos de granularidade
fina. O roteamento de URL do DRF é o Front Controller — fornecido pelo framework.

### ⚪ Identity Map · ⚪ Lazy Load

Implementados pelo `QuerySet` do Django. Aproveitados de graça; registrados por completude.

---

## 4.3 Padrões na camada de apresentação do front

Estes não são teoria: cada um substituiu duplicação medida em `pages/` (ver
[`03-frontend.md` §3.9](03-frontend.md)).

### 🟡 Decorator — cadeia do `HttpClient`

`AxiosHttpClient` → `AuthenticatedHttpClient` → `RefreshingHttpClient` → `LoggingHttpClient`. Cada
elo implementa a mesma porta `HttpClient` e envolve o anterior, então dá para montar cadeias
diferentes por caso: o `AuthRepository` recebe o cliente **cru**, para que um 401 de login não
dispare a tentativa de refresh; o `ViaCepClient` é uma segunda cadeia, sem os decorators de auth.

### 🔴 Strategy — mapas de selo por domínio

`StatusBadge` desenha; `userStatusBadge`, `postingStatusBadge`, `documentStatusBadge` e
`rentalStatusBadge` decidem. Cada mapa é uma estratégia intercambiável de `status → BadgeConfig`,
e é o que permite `shared/` não importar `features/`.

Substituiu 6 implementações de `statusBadge` com 3 formatos de retorno diferentes — e a cópia do
`rentalStatusBadge` no dashboard do locatário não cobria `validating`, mostrando selo vazio.

### 🟡 Composite — `PageShell`, `AdminTable`, `FormField`

Todos compõem por `children` em vez de por prop de conteúdo, o que mantém a árvore de JSX legível
e evita a explosão de props que uma API baseada em configuração traria. `AdminFilterBar` é o caso
claro: o campo de busca é sempre o mesmo, os selects variam por página e entram como `children`.

### 🟡 Template Method — `RentalCard` e `DashboardShell`

A estrutura é fixa (moldura, grade de campos, fileira de botões, painéis expansíveis); os pontos de
variação são explícitos: contraparte, rótulos da avaliação, presença do painel de reagendamento. O
dashboard do locador simplesmente não passa `reschedule`, e o botão fica inerte como já era.

`DashboardShell` faz o mesmo pela sidebar, com um parâmetro genérico `<Tab extends string>` para
que cada dashboard mantenha sua própria união de abas em vez de cair em `string`.

### 🟡 Adapter — `maskedRegister`

Reescreve o valor antes de repassar o evento ao `react-hook-form`, permitindo que campos com máscara
continuem *uncontrolled*. Adapta a interface de evento do DOM à que o RHF espera.

---

## 4.4 Padrões deliberadamente **não** adotados

Registrar o que foi rejeitado, e por quê, é o que distingue uma decisão de projeto de um valor padrão
aceito por omissão.

| Padrão | Por que não |
|---|---|
| **Active Record** | Idiomático no Django e mais produtivo, mas inverte a Regra da Dependência. Rejeitado em favor de Data Mapper — [ADR-002](06-adr.md) |
| **Singleton** | Os serviços do front são singletons de módulo (`export const operatorDocumentService = new OperatorDocumentService()`, `OperatorDocumentService.ts:253`). Dificulta substituição em teste e esconde dependência. Substituído por injeção via composition root |
| **CQRS completo** | Separação física de modelos de leitura e escrita não se paga em ~2.700 linhas. Adotamos apenas a separação lógica: DTOs de saída dedicados |
| **Event Sourcing** | Exigiria event store e projeções. Custo desproporcional ao escopo |
| **Abstract Factory para repositórios** | O composition root simples basta. Uma fábrica por família seria cerimônia sem ganho |
| **Microsserviços** | O monólito modular com bounded contexts explícitos já entrega o isolamento pretendido, sem custo operacional |

---

## 4.5 Rastreabilidade

| Padrão | Aplicado em | Substitui |
|---|---|---|
| Strategy | `application/ports.py`, `infrastructure/classifier.py` | `services/cnh_classifier.py` (estático, não substituível) |
| Template Method | `domain/entities.py`, `application/use_cases/review_document.py` | `views.py:224-289` (duplicação byte a byte) |
| Chain of Responsibility | `application/validators.py` | `views.py:15-32` e `:185-202` (ifs duplicados) |
| Observer | `core/events.py` | `administration/views.py:6-9` (import cruzado) |
| Unit of Work | `infrastructure/unit_of_work.py` | `administration/views.py:61-68` (sem transação) |
| Repository + Data Mapper | `domain/repositories.py`, `infrastructure/` | ORM direto nas views |
| Value Object | `domain/value_objects.py` | `views.py:222`, literais em `administration/views.py` |
| Layer Supertype | `core/models.py` | `create()` copiado em 4 serializers |
| DTO | `application/dto.py`, `interfaces/serializers.py` | serializers que persistem |
| Decorator (front) | `shared/http/decorators/` | interceptors do `AxiosInstance` global |
| Strategy (front) | `features/*/types/*Badges.ts` | 6 cópias de `statusBadge` |
| Composite (front) | `shared/components/`, `features/*/components/` | ~65 blocos de campo, 15 shells de página |
| Template Method (front) | `dashboard/RentalCard`, `dashboard/DashboardShell` | `renderRentalCard` e a sidebar, 2 cópias cada |

---

**Próximo:** [`05-solid.md`](05-solid.md)
