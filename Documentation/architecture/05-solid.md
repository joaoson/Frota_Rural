# 5. SOLID — evidências

Cada princípio com a **violação real** localizada em `arquivo:linha`, a correção e o resultado.
Sem exemplo genérico: tudo abaixo sai do código do Frota Rural.

---

## S — Single Responsibility Principle

> Um módulo deve ter uma, e apenas uma, razão para mudar.

### Violação — `document_validation/views.py` (289 linhas)

Um único arquivo muda por **cinco** razões diferentes:

| Responsabilidade | Onde |
|---|---|
| Transporte HTTP | por toda parte |
| Validação de arquivo | `:15-32`, `:185-202` |
| I/O de sistema de arquivos | `:204-219` (`os.makedirs`, `open`) |
| Regra de negócio | `:239-243` (rejeição exige justificativa) |
| Construção de query | `:53-60`, `:119-126` |
| Persistência | `:247-250` |

O trecho mais revelador — `views.py:204-219` faz *imports no meio da função* e escreve arquivo na
mão:

```python
import uuid
import os
from django.conf import settings

ext = os.path.splitext(file.name)[1].lower() or ".jpg"
filename = f"{uuid.uuid4()}{ext}"
upload_dir = os.path.join(settings.MEDIA_ROOT, "documents")
os.makedirs(upload_dir, exist_ok=True)
```

Enquanto isso, `postings/views.py` resolve o **mesmo** problema com `default_storage`. Duas mecânicas
de upload incompatíveis, com construção de URL diferente (absoluta versus relativa), porque nenhuma
das duas tem dono.

### Correção

Quatro camadas, uma razão de mudança cada. `store_document` como caso de uso único, usando a porta
`FileStorage` — e `default_storage` como convenção única.

### Front-end

- `DashboardLocador.tsx` — **2.493 linhas**, 21 `useState`, 11 abas em um `return`, três blocos de
  mock em escopo de módulo, e lógica de mutação dentro de handlers JSX (`:1201-1234`, repetida em
  `:1357-1373` e `:1492`).
- `CNHUpload.tsx` — **974 linhas**, **30 `useState`** em `:91-127`, dos quais **22 são campos de um
  único formulário**.

---

## O — Open/Closed Principle

> Aberto para extensão, fechado para modificação.

### Violação — três pares de funções duplicadas

| Par | Linhas |
|---|---|
| `operator_licenses_list` ≡ `certifications_list` | `:51-74` ≡ `:117-140` |
| `operator_license_detail` ≡ `certification_detail` | `:77-114` ≡ `:143-180` |
| `review_license` ≡ `review_certification` | `:224-255` ≡ `:258-289` |

O último par é **igual byte a byte**, exceto pelo nome do model. Cerca de 230 das 289 linhas do
arquivo são duplicação.

Custo concreto: adicionar um terceiro tipo de documento (por exemplo, certificado de curso NR-31)
exige copiar e colar mais três pares e manter as três cópias em sincronia para sempre.

### Correção

`ReviewableDocument` como Layer Supertype de domínio e `ReviewDocumentUseCase` como Template Method.
Um tipo novo = uma subclasse. O caso de uso não é modificado.

**Antes:** N tipos ⇒ 3N funções · **Depois:** N tipos ⇒ N entidades, 1 caso de uso.

---

## L — Liskov Substitution Principle

> Subtipos devem ser substituíveis por seus tipos base.

### Aplicação — repositórios e classificadores

`InMemoryOperatorLicenseRepository` precisa ser substituível por `DjangoOperatorLicenseRepository`
sem que o caso de uso perceba. É isso que torna os testes possíveis sem banco.

Igualmente: `StubClassifier` no lugar de `SubprocessCnhClassifier`, e `LoggingClassifier`
(Decorator) no lugar de qualquer um dos dois.

Contrato que os subtipos devem honrar — parte do checklist de revisão:

- `get_by_id` levanta `NotFoundError` quando não existe (nunca retorna `None`);
- `save` é idempotente para a mesma entidade;
- nenhuma implementação fortalece pré-condições nem enfraquece pós-condições.

### Violação latente hoje

`OperatorDocumentService` (front) quebra substituibilidade dentro da **própria classe**: metade dos
métodos lança `OperatorDocumentServiceError`, a outra metade deixa vazar `AxiosError` cru —
`listLicenses` (`:70`), `getLicenseById` (`:81`), `removeLicense` (`:138`) e as gêmeas de
certificação não têm try/catch. Quem chama não pode tratar os métodos de forma uniforme.

---

## I — Interface Segregation Principle

> Nenhum cliente deve depender de métodos que não usa.

### Violação — `UserSerializer` com `fields = '__all__'`

Expõe **todas** as colunas de `Users` e depende de `extra_kwargs` para esconder `password`. Toda
tela recebe o objeto inteiro, use ela dois campos ou vinte. `ContractSerializer` faz o mesmo.

O acréscimo de uma coluna sensível no model passa a vazar por padrão — a segurança fica dependendo
de alguém lembrar de bloqueá-la.

### Correção

DTOs de saída por caso de uso: `UserProfileOutput`, `UserListItemOutput`, `UserAdminOutput`. Cada
cliente depende só do que consome.

### Front-end

`CreateOperatorLicenseRequest` reescreve à mão os 22 campos de `OperatorLicense` em vez de derivá-los
(`Omit<OperatorLicense, "id" | "validation_status" | ...>`). Duas listas para manter em sincronia.

---

## D — Dependency Inversion Principle

> Módulos de alto nível não devem depender de módulos de baixo nível. Ambos devem depender de abstrações.

### Violação — a política depende do detalhe

`views.py:34-37` importa a implementação concreta **dentro do bloco try**:

```python
try:
    from .services.cnh_classifier import CnhClassifier
    result = CnhClassifier.classify(file)
```

`CnhClassifier` é uma classe concreta com métodos estáticos que dispara `subprocess` para um caminho
fixo (`cnh_classifier.py:11`). Não há interface, não há injeção, não há substituição possível.

**Consequência mensurável:** nenhum teste desse endpoint roda sem TensorFlow instalado. Não é uma
questão estética — é a razão pela qual os seis `tests.py` do projeto continuam com 3 linhas cada.

O mesmo vale para o e-mail: `authentication/views.py:96` chama o Resend de forma síncrona dentro do
ciclo de requisição.

### Correção

```
Camada 2 (política)                Camada 3 (detalhe)

ValidateCnhFileUseCase             SubprocessCnhClassifier ──┐
        │                          StubClassifier ───────────┤
        ▼                          LoggingClassifier ────────┤
DocumentClassifier (ABC)  ◄────────────────────────────────┘
        ▲
   declarada em application/ports.py — pelo consumidor
```

A seta aponta **para dentro**. Quem escolhe a implementação é o composition root
(`interfaces/containers.py`), não a view.

---

## Coesão e acoplamento

O critério de avaliação nomeia os dois explicitamente.

### Acoplamento entre bounded contexts

`administration/views.py:6-9` importa models de **quatro** contextos:

```python
from api.models import Rentals, Contracts
from machines.models import Machines
from postings.models import Postings
from users.models import Users
```

`ban_user` (`:55-70`) escreve em quatro tabelas de outros contextos. Qualquer mudança em `Postings`
ou `Rentals` pode quebrar `administration` silenciosamente — não há teste que perceba.

**Correção:** Observer. `administration` publica `UserBanned`; cada contexto reage por conta própria.
Zero imports cruzados. Ver [`diagrams/04-bounded-contexts.md`](diagrams/04-bounded-contexts.md).

### Coesão

Métrica prática: *as coisas que mudam juntas moram juntas?*

Hoje, alterar a regra de rejeição de documento exige tocar `views.py` em dois lugares distantes
(`:239-243` e `:273-277`) — baixa coesão. Depois, a regra está uma vez em `ReviewableDocument.reject()`.

---

## Resumo

| Princípio | Violação | Local | Correção |
|---|---|---|---|
| **SRP** | Cinco responsabilidades em um arquivo | `document_validation/views.py` (289 linhas) | Quatro camadas |
| **SRP** | Componente com 2.493 linhas | `DashboardLocador.tsx` | Camada de hooks + componentes |
| **OCP** | 3 pares de funções duplicadas | `views.py:51-289` | Template Method |
| **LSP** | Erros inconsistentes na mesma classe | `OperatorDocumentService.ts:70,81,138` | Contrato uniforme |
| **ISP** | `fields = '__all__'` | `users/serializer.py` | DTOs por caso de uso |
| **DIP** | Import concreto dentro da função | `views.py:35` | Porta `DocumentClassifier` |
| **Acoplamento** | Import de 4 contextos | `administration/views.py:6-9` | Eventos de domínio |
| **Atomicidade** | 5 escritas sem transação | `administration/views.py:61-68` | Unit of Work |

---

**Próximo:** [`06-adr.md`](06-adr.md)
