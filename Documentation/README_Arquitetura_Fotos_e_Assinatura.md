# Arquitetura: Fotos dos Anúncios e Assinatura Eletrônica

Este documento explica **como** dois subsistemas do Frota Rural foram construídos e
**por que** cada decisão foi tomada. Ele descreve a arquitetura; o passo a passo de
configuração do Firebase está em [`README_Firebase_Storage.md`](README_Firebase_Storage.md).

| Parte | Assunto |
| --- | --- |
| [1](#parte-1--fotos-dos-anúncios-no-firebase-storage) | Fotos dos anúncios no Firebase Storage |
| [2](#parte-2--assinatura-eletrônica-de-contratos) | Assinatura eletrônica de contratos |

---

# Parte 1 — Fotos dos anúncios no Firebase Storage

## O problema

Antes, o upload gravava a foto no disco local do servidor e guardava no banco a **URL
absoluta**, montada a partir do host da requisição:

```python
saved_path = default_storage.save(f"posting_photos/{filename}", ContentFile(...))
image_url  = request.build_absolute_uri(settings.MEDIA_URL + saved_path)
```

Três problemas nisso:

1. **Disco local não escala.** Com mais de uma instância, ou em um container efêmero,
   cada réplica enxerga um disco diferente e um deploy apaga o que foi enviado.
2. **A URL depende do host.** Uma linha gravada em `localhost:8000` continua apontando
   para `localhost:8000` em produção.
3. **O nome do arquivo era o original.** Dois usuários enviando `foto.jpg` colidem, e
   uma foto trocada mantém o mesmo nome — o cache do navegador segue servindo a antiga.

## A decisão central: guardar o caminho, não a URL

O banco guarda apenas o **caminho do objeto** dentro do bucket:

```
postings_photos.image_url = "postings/<posting_id>/<uuid>.jpg"
```

A URL pública é montada em tempo de resposta, pelos serializers. A alternativa —
gravar a URL completa — amarraria cada linha do banco a um bucket específico:

- trocar de bucket, de projeto Firebase ou de CDN viraria um `UPDATE` em massa;
- um bucket renomeado quebraria todas as fotos já cadastradas.

Guardando o caminho, a troca é uma variável de ambiente.

## Fluxo do upload

```
Navegador                    Django                      Firebase Storage
    │                          │                                │
    ├── multipart/form-data ──>│                                │
    │   image + is_primary     │                                │
    │                          ├── valida tipo e tamanho        │
    │                          ├── upload_image() ─────────────>│
    │                          │<──────────── caminho do objeto │
    │                          ├── grava PostingsPhotos         │
    │                          │   (image_url = caminho)        │
    │<── 201 {id, path, url} ──┤                                │
    │                                                           │
    └────────── GET da imagem, direto no Firebase ─────────────>│
```

O navegador nunca fala com o Firebase para **escrever** — só para **ler**. Todo
upload passa pelo Django, que é quem valida e detém a credencial.

## Componentes

| Componente | Arquivo | Responsabilidade |
| --- | --- | --- |
| Cliente do Storage | `BackEnd/djangoapi/firebase_storage.py` | Inicializar o SDK, enviar, apagar e montar URL pública |
| Endpoint de upload | `BackEnd/postings/views.py` → `posting_photos` | Validar o arquivo e registrar a foto |
| Montagem da URL | `BackEnd/postings/serializer.py` | Expandir caminho → URL nas respostas |
| Envio pelo frontend | `FrontEnd/src/services/PostingService/PostingService.ts` | Montar o `FormData` e enviar em sequência |
| Testes | `BackEnd/postings/tests.py` | 11 testes cobrindo upload, capa, validações e legado |

Rota: `POST /api/postings/<uuid>/photos/`

## Decisões de implementação que valem explicar

**Inicialização preguiçosa e thread-safe.** O SDK do Firebase é iniciado uma única vez
por processo, protegido por um `threading.Lock` com dupla verificação. Sem isso, dois
requests simultâneos no primeiro upload após o boot poderiam inicializar o app duas
vezes — o `firebase_admin` recusa a segunda e derruba o request.

**Nome sempre novo, cache eterno.** Cada objeto recebe um UUID novo, nunca o nome
original do arquivo. Como o nome nunca se repete, o conteúdo é imutável, e o upload
marca `Cache-Control: public, max-age=31536000, immutable`. O navegador guarda a
imagem por um ano sem precisar revalidar. Usar o nome original traria dois problemas:
colisão entre usuários e cache servindo a foto antiga depois de uma troca.

**Uma capa por anúncio.** A promoção da capa roda dentro de `transaction.atomic()`:
rebaixa a capa atual e cria a nova no mesmo commit, para que nunca existam duas capas
— nem zero — se o request falhar no meio.

**Validação antes do upload.** Tipo (`JPG`/`PNG`/`WEBP`) e tamanho (5MB) são conferidos
antes de gastar banda com o Firebase.

**Erros que dizem a causa.** Os códigos são distintos de propósito:

| Código | Significado |
| --- | --- |
| `400` | Arquivo inválido: tipo não suportado, acima de 5MB, ou corpo que não é multipart |
| `502` | O Firebase recusou ou está fora do ar |
| `503` | O Firebase não está configurado neste ambiente (`.env` incompleto) |

A distinção entre `502` e `503` importa em operação: um é problema de infraestrutura
externa, o outro é configuração local — e o `503` traz a instrução do que preencher.

O caso do corpo não-multipart merece destaque: quando o `Content-Type` está errado, o
Django sequer popula `request.FILES`, e a mensagem ingênua seria "nenhum arquivo
enviado" — que aponta para o lugar errado. O endpoint detecta isso e diz qual
`Content-Type` chegou.

**Compatibilidade com o legado.** Registros antigos (seed, uploads locais) guardam a
URL absoluta em vez do caminho. `public_url()` detecta `http://`/`https://` e devolve o
valor como está, então dados antigos e novos convivem sem migração.

**`Content-Type: undefined` no axios.** O `AxiosInstance` define
`application/json` como padrão. Se esse header sobrevivesse ao envio do `FormData`, o
boundary do multipart não seria gerado e o Django não enxergaria o arquivo. Passar
`undefined` remove o padrão e deixa o navegador montar o header correto.

**Ordenação previsível.** `_sorted_photos()` devolve a capa primeiro e o restante na
ordem de envio, então a galeria não muda de ordem entre um request e outro.

## Segurança

A **service account** dá acesso total ao projeto Firebase. Ela fica fora do git por
padrões amplos no `BackEnd/.gitignore` — `*service-account*.json`,
`*firebase-adminsdk*.json` e variantes — escolhidos de propósito para pegar também
nomes digitados errado.

As **Storage Rules** liberam leitura pública apenas no prefixo `postings/` e bloqueiam
escrita para todo mundo. O SDK Admin usado pelo Django **não passa por essas regras**
(autentica pela service account), então o backend continua escrevendo normalmente
enquanto o navegador só lê.

---

# Parte 2 — Assinatura eletrônica de contratos

> O **mapa de chamadas** do fluxo — do clique ao INSERT, com diagramas de sequência
> e de dependência — está em [`README_Fluxo_Assinatura.md`](README_Fluxo_Assinatura.md).
> Esta parte cobre o **porquê** de cada decisão.

## Base legal

No Brasil, a **assinatura eletrônica simples** tem validade entre as partes:

- **MP 2.200-2/2001, art. 10, §2º** — documentos eletrônicos assinados por outro meio
  que não o ICP-Brasil são válidos se as partes aceitarem esse meio como válido;
- **Lei 14.063/2020, art. 4º, I** — define e admite a assinatura eletrônica simples.

Não é preciso contratar plataforma de assinatura nem certificado digital. O que
sustenta a assinatura em uma eventual disputa não é o carimbo de um fornecedor: é a
**qualidade da evidência** guardada no momento do aceite.

## O que é gravado a cada aceite

| Evidência | Campo | Por quê |
| --- | --- | --- |
| Hash SHA-256 do documento | `document_hash` | Prova **qual texto exato** foi aceito |
| Versão do documento | `document_version` | Permite reconstruir o modelo daquela época |
| Timestamp UTC | `signed_at` | **Sempre do servidor** — data do cliente não tem valor probatório |
| IP de origem | `ip_address` | De onde partiu o aceite |
| User-Agent | `user_agent` | Com qual navegador/dispositivo |
| Quem aceitou | `signer`, `signer_name`, `signer_email` | Identifica a parte |
| Posse do e-mail | `otp_verified` | Confirmação por código enviado ao e-mail |
| Encadeamento | `previous_hash`, `record_hash` | Torna adulteração detectável |

Nome e e-mail ficam **copiados no registro**, além da FK para o usuário: se o cadastro
mudar depois, a evidência preserva o que valia no instante do aceite.

## Por que o hash exclui o bloco de assinatura

O hash é calculado sobre os **termos** do contrato, e o bloco `assinatura` fica de fora.

A razão é prática: esse bloco muda a cada aceite. Se ele entrasse no hash, o locatário
assinaria um documento e o locador assinaria outro — hashes diferentes para o mesmo
contrato, e a verificação nunca fecharia. Excluindo-o, **as duas partes assinam
exatamente o mesmo hash**, que é o comportamento esperado de um contrato.

## Canonicalização determinística

Para que o hash seja reproduzível meses depois, os bytes precisam ser sempre os mesmos
para o mesmo conteúdo:

```python
json.dumps(document, sort_keys=True, ensure_ascii=False,
           separators=(",", ":"), default=str)
```

- `sort_keys` — a ordem das chaves em um dict não pode alterar o hash;
- `separators` sem espaço — remove variação de formatação;
- `ensure_ascii=False` — mantém os acentos como UTF-8, de forma estável.

Isso obriga o documento a ser **determinístico na origem**: nada de `now()`, valores
aleatórios ou dados que mudem entre duas chamadas.

## Encadeamento: por que não basta uma linha por assinatura

Cada registro guarda o hash do registro anterior, e sela o conjunto no próprio hash:

```
GENESIS (000…0)
    │
    ▼
Registro 1 ── previous_hash = 000…0
              record_hash   = H(conteúdo₁ + 000…0)   ──┐
                                                       │
    ┌──────────────────────────────────────────────────┘
    ▼
Registro 2 ── previous_hash = record_hash₁
              record_hash   = H(conteúdo₂ + record_hash₁)
```

`record_hash` cobre **todos** os campos da evidência mais o `previous_hash`. Alterar um
IP no registro 1 muda seu `record_hash`, o que quebra o `previous_hash` do registro 2 —
e assim por diante até o fim da cadeia. Falsificar um aceite exigiria recalcular todos
os registros seguintes, e `verify_chain()` detecta a divergência.

## Imutabilidade em duas camadas

**Camada 1 — o modelo.** `ContractSignatures.save()` recusa qualquer alteração de um
registro existente e `delete()` recusa remoção, ambos levantando `ImmutableRecordError`.

**Camada 2 — o banco.** Duas triggers no Postgres (`contract_signatures_no_update` e
`contract_signatures_no_delete`) levantam exceção em qualquer `UPDATE` ou `DELETE`.

A segunda camada existe porque a primeira só protege quem passa pelo ORM. Um script
com `psql`, um `queryset.update()` ou uma migração distraída contornariam o modelo — e
esbarram na trigger.

> **Consequência prática:** não há como limpar assinaturas de teste com `DELETE`. Para
> ensaiar uma assinatura sem deixar rastro, rode dentro de uma transação e faça
> rollback. Para limpar um banco de desenvolvimento, derrube as triggers antes.

## Confirmação por e-mail (OTP)

Antes do aceite, a parte recebe um código de 6 dígitos no e-mail da conta e o informa
na tela. Isso prova **posse do endereço**, não apenas posse de uma sessão aberta.

- **Obrigatório por padrão** (`CONTRACT_SIGNATURE_REQUIRE_OTP=true`);
- Apenas o **hash** do código é persistido, salgado com o id do contrato — um vazamento
  da tabela não entrega códigos válidos, e o mesmo código em contratos diferentes gera
  hashes diferentes;
- Expira em 10 minutos, uso único, máximo de 5 tentativas;
- Mesmo com a exigência desligada, um código **informado e errado** recusa a assinatura:
  aceitar ignorando um código errado seria pior do que não pedir código nenhum.

> A variável existe como escape hatch: com a exigência ligada e o envio de e-mail
> indisponível, **ninguém consegue assinar**. Em desenvolvimento sem Resend
> configurado, use `CONTRACT_SIGNATURE_REQUIRE_OTP=false`.

## Componentes

| Componente | Arquivo | Responsabilidade |
| --- | --- | --- |
| Documento do contrato | `BackEnd/contracts/contract_document.py` | Montar o documento a partir dos dados reais |
| Evidência | `BackEnd/contracts/signature_evidence.py` | Canonicalizar, hashear, encadear, verificar, OTP |
| Modelos | `BackEnd/contracts/models.py` | `ContractSignatures`, `ContractSignatureOtps` |
| Migração | `BackEnd/api/migrations/0002_…py` | Tabelas + triggers append-only |
| Troca de app | `contracts/migrations/0001` + `api/migrations/0003` | Move o estado sem tocar no banco |
| Endpoints | `BackEnd/contracts/views.py` | Documento, aceite, auditoria, OTP |
| E-mail do código | `BackEnd/authentication/emailing/email.py` | Template do OTP (via Resend) |
| Contrato (tela) | `FrontEnd/src/pages/Contrato/Contrato.tsx` | Exibir o contrato e a evidência |
| Fluxo de assinatura | `FrontEnd/src/pages/Reservar.tsx` | OTP, aceite e recibo |

## Endpoints

| Método e rota | O que faz |
| --- | --- |
| `GET /api/contracts/<id>` | Documento + datas de assinatura + hash atual |
| `POST /api/contracts/<id>/otp` | Envia o código por e-mail (`role`) |
| `POST /api/contracts/<id>/sign` | Registra o aceite (`role`, `name`, `otp`) |
| `GET /api/contracts/<id>/evidence` | Trilha de auditoria + conferência da cadeia |

O `<id>` aceita tanto o id do contrato quanto o id do aluguel — o frontend trabalha
com o aluguel, e forçar a tradução em cada chamada só geraria um round-trip extra.

## Fluxo completo

```
1. GET /contracts/<id>        → a parte lê o documento (hash exibido na tela)
2. POST /contracts/<id>/otp   → código de 6 dígitos vai para o e-mail
3. POST /contracts/<id>/sign  → servidor:
                                  valida o OTP
                                  recalcula o hash do documento
                                  carimba UTC, IP, User-Agent, signatário
                                  encadeia ao registro anterior
                                  grava (append-only)
                                  atualiza o status do contrato
4. recibo exibido na tela     → hash, data UTC, IP, hash do registro
```

Status resultante: com **uma** parte assinada, o contrato fica `pending_signatures` e o
aluguel vira `active`; com **as duas**, ambos viram `signed`.

## Como auditar

`GET /api/contracts/<id>/evidence` devolve `cadeia_integra` (booleano) e
`inconsistencias` (lista). A verificação faz três conferências por registro:

1. o `previous_hash` bate com o `record_hash` do anterior;
2. o `record_hash` recalculado bate com o gravado (conteúdo não foi alterado);
3. o `document_hash` gravado bate com o hash do documento **atual**.

A terceira é a que detecta alteração no contrato depois de assinado: se alguém mudar o
modelo do maquinário no cadastro, o documento muda, o hash muda, e a divergência
aparece — a assinatura continua íntegra, mas deixa de corresponder ao documento atual.

## Remoção dos valores fixos no código

O gerador do contrato tinha valores fabricados: CPFs de exemplo (`123.456.789-00`),
`"Casado"`/`"Solteiro"`, município fixo `Castro/PR`, `John Deere 6135J 2021`,
`R$ 350.000,00` de valor de referência, tarifa `180,00` e horários de assinatura
inventados (`"às 14:00"`).

Isso é inofensivo em uma tela de protótipo e **inaceitável em um documento assinado**:
o hash passaria a certificar dados falsos, e o contrato afirmaria um CPF ou um foro que
a plataforma não conhece. Todos foram substituídos por dados reais ou por vazio:

| Antes | Agora |
| --- | --- |
| CPF de exemplo para representante de PJ | Vazio — o CPF do representante não é cadastrado |
| `"Casado"` / `"Solteiro"` | Vazio — estado civil não é coletado |
| `Castro/PR` fixo | Município e UF extraídos do endereço do locatário |
| Marca/modelo/ano de exemplo | Dados reais do maquinário, ou "Não informado" |
| `R$ 350.000,00` como teto de indenização | Cláusula 7.3 remete a laudo/orçamento |
| Datas de assinatura inventadas | Timestamps reais do registro de evidência |

Também foi corrigida uma inconsistência na Cláusula 4: `tarifa × horas` não fechava com
o total, porque o total inclui a taxa da plataforma. O documento agora mostra a
composição (locação + taxa), **derivada dos valores realmente cobrados** em vez de um
percentual fixo no código — se a política de taxas mudar, o contrato continua correto.

## Limitações conhecidas

- **O locador não assina pela interface.** A API aceita `role: "locador"` e exige OTP
  para ele também, mas ainda não existe tela. Quando existir, precisará solicitar o
  código como a tela do locatário faz.
- **Assinaturas anteriores ao OTP obrigatório** têm `otp_verified = false`. Os registros
  são append-only e não podem ser corrigidos — nem deveriam, já que de fato não houve
  confirmação de e-mail. Seguem válidas como assinatura simples, com evidência um pouco
  mais fraca.
- **Não há valor de referência do maquinário.** A tabela `machines` não tem essa coluna,
  então o teto de indenização da Cláusula 7.3 remete a laudo. Restaurar o teto exige um
  campo novo.
- **Estado civil do representante** não é coletado no cadastro e sai vazio no contrato.
- **Sem carimbo de tempo de terceiro.** O timestamp é do servidor. Para disputas de alto
  valor, um carimbo de tempo de autoridade externa (RFC 3161) seria o próximo passo.
