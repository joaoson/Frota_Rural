# 6. Architecture Decision Records

Formato enxuto: **contexto → decisão → alternativas rejeitadas → consequências**. As alternativas
rejeitadas são a parte que importa — é o que distingue uma decisão de um valor padrão aceito por
omissão.

Data-base: junho de 2026. Status: aceito, salvo indicação em contrário.

---

## ADR-001 — Adotar Clean Architecture em quatro camadas

**Contexto.** Todo o back-end vive em `views.py`. `document_validation/views.py` tem 289 linhas
misturando HTTP, validação, I/O de arquivo, regra de negócio e persistência. O critério de avaliação
do projeto exige "conceitos de Clean Architecture, separação de responsabilidades, baixo acoplamento
e alta coesão".

**Decisão.** Quatro camadas por bounded context (`domain/`, `application/`, `infrastructure/`,
`interfaces/`), com a Regra da Dependência apontando para dentro.

**Alternativas rejeitadas.**

- *Manter tudo em `views.py`.* Não atende ao critério, e a duplicação já é mensurável: ~230 das 289
  linhas do módulo piloto.
- *Camadas simples Services/Selectors (estilo HackSoft).* Muito mais barato e idiomático em Django.
  Rejeitado porque os serviços importam o ORM diretamente — não há inversão de dependência, e o
  resultado seria "sistema em camadas", não Clean Architecture. Ficaria vulnerável em banca.
- *Microsserviços.* Isolamento equivalente ao do monólito modular, com custo operacional
  desproporcional para uma equipe de quatro pessoas.

**Consequências.** Mais arquivos por contexto e curva de aprendizado para o time. Em troca: regras de
negócio testáveis sem infraestrutura e conformidade verificável com o critério de avaliação.

---

## ADR-002 — Data Mapper em vez de Active Record

**Contexto.** O ORM do Django implementa Active Record: o objeto de domínio *é* o objeto de
persistência. Se a entidade herda de `models.Model`, a Camada 1 importa Django e a Regra da
Dependência é violada.

**Decisão.** Entidades de domínio são dataclasses puras. Os models do Django ficam em
`infrastructure/models.py` como estruturas de persistência. `infrastructure/mappers.py` traduz entre
os dois.

**Alternativas rejeitadas.**

- *Usar models do Django como entidades.* Bem mais produtivo e o caminho idiomático. Rejeitado: torna
  impossível o teste de aceitação da Camada 1 (`grep django domain/` vazio) e reduz a arquitetura a
  nomenclatura sem substância.
- *ORM alternativo com Data Mapper nativo (SQLAlchemy).* Resolveria de forma nativa, mas exigiria
  abandonar migrations, admin e o ecossistema DRF em um projeto já em andamento.

**Consequências.** Cada entidade tem duas representações e um mapper — código repetitivo escrito à
mão. **Este é o custo mais alto de toda a arquitetura e o ponto mais provável de questionamento em
banca.** A justificativa é que Clean Architecture sem inversão no acesso a dados não é Clean
Architecture.

---

## ADR-003 — Portas e adaptadores para ML e e-mail

**Contexto.** `document_validation/services/cnh_classifier.py` dispara `subprocess` para uma segunda
venv Python 3.13 (TensorFlow não suporta 3.14), com `venv/bin/python` fixo — caminho POSIX que quebra
no Windows. `views.py:35` importa a classe concreta dentro da função. Nenhum teste do endpoint roda
sem TensorFlow instalado.

**Decisão.** Portas `DocumentClassifier`, `FileStorage` e `EmailSender` em `application/ports.py`,
com adaptadores concretos e stubs.

**Alternativas rejeitadas.**

- *Chamar o classificador diretamente.* Situação atual. Impede qualquer teste.
- *Mock por `unittest.mock.patch`.* Funciona, mas acopla o teste ao caminho de import do módulo e
  não torna a substituição explícita no desenho.

**Consequências.** Casos de uso rodam em milissegundos nos testes. Trocar o modelo de ML, ou migrá-lo
para um serviço HTTP, não toca regra de negócio.

---

## ADR-004 — Portas apenas onde há fronteira real

**Contexto.** Levada ao extremo, a inversão de dependência exigiria uma interface para cada
colaboração — inclusive as triviais.

**Decisão.** Portas apenas onde existe fronteira de verdade: persistência (repositórios), integrações
externas (ML, e-mail, storage) e transação (Unit of Work). Colaborações internas ao domínio usam tipos
concretos.

**Alternativa rejeitada.** *Interface para tudo.* Produz indireção sem ganho — uma interface com uma
única implementação que nunca vai variar é ruído, e sinaliza padrão aplicado sem justificativa.

**Consequências.** Menos cerimônia. Exige julgamento na revisão: a pergunta é "existe uma segunda
implementação plausível, inclusive de teste?".

---

## ADR-005 — Eventos de domínio entre bounded contexts

**Contexto.** `administration/views.py:6-9` importa models de quatro contextos. `ban_user` (`:55-70`)
executa cinco escritas em quatro tabelas alheias — **sem `transaction.atomic`**. Uma falha parcial
deixa um usuário banido com anúncios ativos.

**Decisão.** Contextos não se importam. `administration` publica `UserBanned`; cada contexto registra
seu handler. A operação inteira roda dentro de um Unit of Work.

**Alternativas rejeitadas.**

- *Manter os imports diretos.* Acoplamento máximo; qualquer mudança em `Postings` quebra
  `administration` sem aviso.
- *Fila de mensagens (Celery/RabbitMQ).* Traria assincronia real, mas adiciona infraestrutura que o
  projeto não tem — não há sequer Docker no repositório.

**Consequências.** `EventBus` síncrono e in-process, dentro da transação. O fluxo fica menos óbvio de
seguir em um passo a passo — mitigado pelo diagrama de componentes.

---

## ADR-006 — TanStack Query como camada de store no front-end

> **Revisado em junho de 2026.** A versão anterior deste ADR decidia o oposto — `useAsync` próprio,
> sem dependências. A decisão foi revertida ao implementar o piloto da feature `machines`; o texto
> antigo está resumido em "Alternativas rejeitadas" para preservar o histórico.

**Contexto.** Nenhuma página cacheia requisições. Cada uma reimplementa `loading` / `erro` / `data`
(`Reservar.tsx:120`, `AnuncioDetalhe.tsx:77`, `GerenciarAnuncio.tsx:24`, `Admin/Documentos.tsx:100`).
`DashboardLocador.tsx:329-375` busca **todos** os anúncios do sistema e filtra no cliente, e
`DashboardLocador.tsx:727` mantém o cache na mão: chama `machineService.update` e depois remapeia o
estado local para a tela não ficar defasada — uma atualização otimista escrita à mão.

**Decisão.** Adotar `@tanstack/react-query` como camada de estado de servidor. O `MachineStore`
passa a ser dono das chaves de cache (`machineKeys`) e do ciclo de vida do cache
(`invalidateLists()`, `clear()`), operando sobre o `QueryClient`; os hooks fazem a ponte com o React.

**Alternativas rejeitadas.**

- *`useAsync` próprio com `useSyncExternalStore`* — a decisão anterior. Zero dependências e desenho
  inteiramente nosso, mas nos deixaria mantendo invalidação de cache à mão. "Escrevemos nosso
  próprio cache" é uma posição mais frágil de defender do que "usamos uma biblioteca madura", e
  reinventar infraestrutura é uma crítica clássica em banca.
- *Manter `useEffect` + `useState`* — é o estado atual, com quatro cópias do mesmo trio e três
  estilos incompatíveis de tratamento de erro.

**Consequências.** Primeira dependência nova do projeto (~13 kB gzip). A arquitetura em si não muda:
repository, mapper, ACL com zod, decorators de `HttpClient` e o composition root continuam iguais —
o TanStack só substitui o que existe **dentro** do store.

> **Limitação aceita conscientemente.** O piloto migrou apenas `NovoEquipamento`, que é um formulário
> só de criação. Ele exercita `useMutation` e quase nada do que justifica a biblioteca: cache,
> deduplicação, revalidação e invalidação vivem todos no lado da leitura. O ganho aparece quando
> `NovoAnuncio` e `DashboardLocador` passarem a ler máquinas pela mesma query key. A decisão é montar
> a estrutura agora e colher depois — não uma expectativa de ganho imediato.

---

## ADR-007 — Adotar `react-hook-form` e `zod`, já instalados

**Contexto.** `CNHUpload.tsx:91-127` tem **30 `useState`**, sendo **22 campos de um único formulário**.
`react-hook-form`, `@hookform/resolvers` e `zod` já constam do `package.json` e nunca foram
importados.

**Decisão.** `useForm` com resolver zod nos formulários; schemas zod também em
`infrastructure/schemas.ts` como Anti-Corruption Layer, validando respostas da API na fronteira.

**Alternativa rejeitada.** *Manter `useState` manual.* Mantém os 30 estados, 20 setters sequenciais
na carga e a montagem manual do DTO de 22 campos no submit.

**Consequências.** Usar pacote já instalado não viola a restrição de dependências. Ganho adicional: o
tipo passa a ser verificado em runtime — hoje `OperatorLicense` é `type`, apagado na compilação, e
uma mudança de campo no back-end quebra em produção, não no build.

---

## ADR-008 — Esta entrega é documental

**Contexto.** O critério lê "o sistema aplica" — presente do indicativo. Quatro pessoas têm branches
em andamento, e uma reestruturação simultânea geraria conflitos extensos.

**Decisão.** Entregar a arquitetura como documentação, com implementações de referência **completas e
copiáveis** em `reference/`. A migração do código é trabalho subsequente, módulo a módulo.

**Alternativas rejeitadas.**

- *Reestruturação big-bang.* Melhor estado final; conflita com todas as branches abertas.
- *Piloto em `document_validation`.* Foi considerado — o módulo pertence a um único autor (AB-7983),
  então não geraria conflito. Preterido nesta rodada.

**Consequências, declaradas.** Quem abrir `views.py` hoje continua encontrando 289 linhas de
responsabilidades misturadas. A documentação compensa especificando o desenho por completo, mas
**compensação não é equivalência**. Aplicar a referência ao módulo piloto é o próximo passo
recomendado, e o de melhor relação custo-benefício.

---

## ADR-009 — Estrutura de pastas por feature, com store na pasta `api/`

**Contexto.** `specification.md` define a organização do front-end: `app/`, `features/<feature>/`
com `{components, api, types, hooks}`, e `shared/`. Ela difere da estrutura de quatro camadas
(`domain/`, `application/`, `infrastructure/`, `interfaces/`) descrita em `02-backend.md` e usada no
back-end.

**Decisão.** Seguir `specification.md` no front-end. O mapeamento para Clean Architecture é:

| Pasta da spec | Anel de Clean Architecture |
|---|---|
| `types/` (entidade + schemas zod) | Entities |
| `api/<Feature>Repository.ts` (interface) | porta declarada pelo consumidor |
| `api/<Feature>Repository.ts` (implementação), `api/*Mapper.ts` | Interface Adapters / Gateway |
| `api/<Feature>Store.ts` | Interface Adapters — **Presenter / View Model** |
| `hooks/`, `components/` | Interface Adapters — View |
| `shared/http/`, `shared/auth/` | Interface Adapters + Frameworks |

**Alternativa rejeitada.** *Impor as quatro pastas do back-end também no front.* Simetria de
vocabulário, mas contraria o documento de organização que a equipe escreveu, e a spec é a fonte de
verdade sobre layout.

**Consequências.** A feature não tem uma pasta `domain/` isolada, então o teste de aceitação de
camada é por arquivo e não por diretório: `types/` e o mapper não podem importar `axios` nem React.
Um `Store` dentro de `api/` é incomum — o store é apresentação, não acesso a dados —, mas a
uniformidade com o resto do time vale mais do que a precisão do nome da pasta.

---

## Pendências registradas

| Item | Onde |
|---|---|
| Migration do `UUIDTimeStampedModel` | `core/models.py` — muda `id`, `created_at`, `updated_at` de 5 models |
| `DEFAULT_PERMISSION_CLASSES` ausente ⇒ DRF em `AllowAny` | `djangoapi/settings.py` |
| `role` como `TextField` livre, nunca verificado no servidor | `users/models.py` |
| `.env` versionados; **rotacionar `RESEND_API_KEY`** | `BackEnd/.env`, `FrontEnd/src/.env` |
| `SECRET_KEY` fixa e reusada como chave JWT; `DEBUG = True` | `settings.py:29` |
| `CommonMiddleware` duplicado | `settings.py:59,62` |
| `README_Database_Migrations.md` descreve o layout pré-refatoração | `Documentation/` |
| `convert_doc_to_pdf.yml` aponta para caminho de docx que mudou | `.github/workflows/` |

---

**Próximo:** [`07-conventions.md`](07-conventions.md)
