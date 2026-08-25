# 1. Clean Architecture aplicada ao Frota Rural

## 1.1 A Regra da Dependência

Clean Architecture (Robert C. Martin, 2017) não é uma estrutura de pastas. É **uma única regra**, da
qual a estrutura de pastas é consequência:

> Dependências de código-fonte apontam apenas para dentro, em direção a políticas de mais alto nível.

"Para dentro" significa: em direção às regras de negócio, para longe dos detalhes. Framework, banco
de dados, protocolo HTTP e biblioteca de machine learning são **detalhes**. Eles podem ser trocados.
A regra de que "uma CNH rejeitada exige justificativa" não pode.

O critério prático que usamos para decidir o que é detalhe: *se isso mudasse, a regra de negócio
mudaria junto?* Trocar PostgreSQL por MySQL não muda nada sobre CNH. Logo, o banco é detalhe.

## 1.2 As quatro camadas

### Camada 1 — Entities (regras de negócio corporativas)

Objetos de domínio puros com **comportamento**, não apenas dados. Vivem em `domain/`.

Contêm as regras que existiriam mesmo que o Frota Rural não fosse um sistema web — se o processo
fosse feito em papel, essas regras continuariam valendo. Exemplo: uma CNH vencida não habilita
ninguém; uma rejeição sem justificativa é inválida.

Importam **nada** do Django. Este é o teste de aceitação verificável descrito no
[README](README.md#o-teste-de-aceitação-da-camada-1).

### Camada 2 — Use Cases (regras de negócio da aplicação)

Orquestram entidades para realizar uma operação do sistema: "administrador revisa um documento",
"operador submete uma CNH". Vivem em `application/`.

Um caso de uso é um objeto com um método `execute()` — o padrão **Command**. Ele recebe suas
dependências por injeção no construtor, sempre **tipadas como interfaces abstratas (portas)**, nunca
como implementações concretas.

Um caso de uso não sabe se os dados vêm do PostgreSQL ou de um dicionário em memória. Não sabe se a
requisição chegou por HTTP, por linha de comando ou por um teste.

### Camada 3 — Interface Adapters

Converte entre o formato conveniente para as camadas internas e o formato exigido pelos detalhes
externos. Duas metades:

- **`infrastructure/`** — lado da persistência e das integrações. Implementações concretas das
  portas: repositórios Django, mappers, adaptador do classificador de ML, adaptador de e-mail.
- **`interfaces/`** — lado da entrega. Views DRF, serializers (reduzidos a DTOs), roteamento e o
  *composition root* que monta o grafo de dependências.

### Camada 4 — Frameworks & Drivers

Django, DRF, PostgreSQL, TensorFlow, Resend, axios. Código que não escrevemos. Fica na borda,
plugado por adaptadores.

## 1.3 O ponto central: Active Record versus Data Mapper

Esta é a decisão mais importante — e a mais atacável em uma banca — então ela fica explícita.

O ORM do Django implementa **Active Record** (Fowler, *PoEAA*): o objeto de domínio é ele próprio o
objeto de persistência. `license.save()` grava no banco. Isso é produtivo e é o caminho idiomático
do Django.

E é **incompatível com a Regra da Dependência**. Se a entidade `OperatorLicense` herda de
`models.Model`, então a Camada 1 importa Django, e a seta de dependência aponta para fora. A
arquitetura deixa de ser Clean Architecture — passa a ser um sistema em camadas com nomes de Clean
Architecture, que é coisa diferente.

A alternativa, também de Fowler, é **Data Mapper**: uma camada que move dados entre objetos de
domínio e o banco, mantendo os dois independentes um do outro.

```
Active Record (padrão do Django)          Data Mapper (o que adotamos)

  ┌────────────────────┐                   ┌──────────────────┐
  │  OperatorLicense   │                   │ OperatorLicense  │  ← dataclass pura
  │  (models.Model)    │                   │   (domain)       │     sem Django
  │                    │                   └────────┬─────────┘
  │  dados + regras    │                            │
  │  + persistência    │                   ┌────────┴─────────┐
  │                    │                   │     Mapper       │  ← tradução explícita
  └─────────┬──────────┘                   └────────┬─────────┘
            │                              ┌────────┴─────────┐
        PostgreSQL                         │ OperatorLicense  │  ← models.Model,
                                           │  (ORM model)     │     só persistência
                                           └────────┬─────────┘
                                                PostgreSQL
```

### O custo, declarado

Data Mapper **não é de graça**:

- Cada entidade passa a ter duas representações e um mapper entre elas.
- Escrevemos à mão código que o Django daria pronto.
- Perdemos parte do açúcar do ORM dentro do domínio (`related_name`, lazy loading transparente).
- O time precisa aprender uma convenção que não é a idiomática do Django.

### O ganho, também declarado

- Regras de negócio testáveis **sem banco de dados** — sem fixtures, sem migrations, sem `pytest-django`.
- Hoje, nenhum teste do endpoint de validação de CNH consegue rodar sem TensorFlow instalado, porque
  `document_validation/services/cnh_classifier.py` dispara um `subprocess` para uma segunda venv. Com
  a porta `DocumentClassifier` e um `StubClassifier`, o caso de uso roda em milissegundos.
- Trocar PostgreSQL, ou expor os mesmos casos de uso por GraphQL ou CLI, não toca o domínio.
- Atende ao critério de avaliação de forma verificável, e não apenas declarada.

### Por que aceitamos o custo

Porque o critério de avaliação exige Clean Architecture, e Clean Architecture sem inversão de
dependência no acesso a dados é apenas nomenclatura. A alternativa pragmática (usar models do Django
como entidades) está registrada e **rejeitada** em [`06-adr.md`](06-adr.md) — ADR-002, com as razões.

## 1.4 Portas e adaptadores

Uma **porta** é uma interface abstrata (`abc.ABC` no Python, `interface` no TypeScript) declarada
por uma camada interna, descrevendo o que ela precisa. Um **adaptador** é a implementação concreta,
que vive na borda.

Quem declara a interface é o **consumidor**, não o fornecedor. É isso que inverte a dependência.

```python
# application/ports.py — Camada 2 declara o que precisa
class DocumentClassifier(ABC):
    @abstractmethod
    def classify(self, file: DocumentFile) -> ClassificationResult: ...

# infrastructure/classifier.py — Camada 3 fornece
class SubprocessCnhClassifier(DocumentClassifier): ...
class StubClassifier(DocumentClassifier): ...      # para testes
```

O caso de uso depende do ABC. Qual implementação chega até ele é decidido no *composition root*
(`interfaces/containers.py`) — o único lugar do sistema que conhece todas as camadas ao mesmo tempo,
e por isso o único autorizado a montar o grafo de objetos.

Portas no projeto: `DocumentClassifier`, `FileStorage`, `EmailSender`, `UnitOfWork` e os repositórios.

## 1.5 Bounded contexts

Cada app Django é um bounded context, e essa divisão **já existe** no projeto. As quatro camadas
são replicadas *dentro* de cada um:

```
BackEnd/
├── users/                  ← bounded context
│   ├── domain/  application/  infrastructure/  interfaces/
├── document_validation/    ← bounded context (módulo piloto desta documentação)
│   ├── domain/  application/  infrastructure/  interfaces/
├── machines/   postings/   administration/   authentication/
└── core/                   ← Layer Supertype, exceções, exception handler, permissions
```

Contextos **não** se importam diretamente. Hoje isso é violado: `administration/views.py:6-9`
importa models de quatro apps e executa transições de estado multi-tabela — **sem
`transaction.atomic`**. Uma falha no meio deixa um usuário banido com anúncios ativos.

A correção estrutural é dupla: **Unit of Work** para a atomicidade e **Observer** (eventos de
domínio) para o acoplamento — `administration` publica `UserBanned`, e cada contexto reage por
conta própria, sem que ninguém importe models alheios.

## 1.6 O que o Django continua fazendo

Adotar Clean Architecture não significa abandonar o framework. O Django continua responsável por:

- roteamento de URL (**Front Controller**), middleware, sessão;
- migrations e o mapeamento objeto-relacional na Camada 3;
- **Identity Map** e **Lazy Load** — padrões de Fowler que o `QuerySet` já implementa, e que
  aproveitamos de graça (registrados no catálogo como *framework-provided*);
- serialização e o parsing de multipart no DRF.

O que ele deixa de fazer é **hospedar regra de negócio**.

---

**Próximo:** [`02-backend.md`](02-backend.md) — responsabilidade arquivo a arquivo e as regras de import.
