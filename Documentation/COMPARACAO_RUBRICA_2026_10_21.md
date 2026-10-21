# Comparação com a rubrica em 21 de outubro de 2026

O projeto agora tem cobertura medida e publicada na CI, personalização persistida dos painéis, documentação HTTP validada e uma stack de observabilidade exercitada. Entre as seis frentes priorizadas, a evidência sustenta **100% no critério de cobertura backend**, **100% em responsividade e customização**, **60% em cobertura frontend**, **60% em documentação**, **60% em observabilidade** e **30% em migrações**. Os percentuais são níveis da rubrica, não percentuais de implementação do produto.

Para apresentar, use o [roteiro com telas, comandos e falas](ROTEIRO_DEMONSTRACAO_RUBRICA.md). Esta comparação atualiza a [avaliação de 14/10](AVALIACAO_RUBRICA_E_PLANO_DE_EVOLUCAO.md), que permanece como histórico.

## Base da comparação

- Código: branch `develop_joaofre_locacoes_integradas`, commit [`8943e1a`](https://github.com/joaoson/Frota_Rural/commit/8943e1a22d5b982554976281305a9deebe908abb).
- Rubrica: arquivo fornecido `QUARTA_TCC_Acompanhamento_Amanda_Carlos_Joao_Tiago_(Rubricas).csv`, localizado novamente em 21/10. Seus níveis foram lidos diretamente; a exportação não contém as fórmulas originais da planilha.
- Execução remota: [Quality and browser tests 39612427515](https://github.com/joaoson/Frota_Rural/actions/runs/39612427515), concluída com sucesso em 21/10/2026. Os quatro jobs passaram: configuração, observabilidade, frontend e testes de backend/navegadores.
- Artefatos dessa execução: `frontend-coverage`, `backend-coverage-and-openapi` e `playwright-report`. As métricas abaixo vêm desses artefatos; as [medições locais anteriores](EVIDENCIAS_QUALIDADE.md) têm pequenas diferenças e não devem ser misturadas com esta execução.
- [Resumo numérico versionável](evidencias/ci-2026-10-21.json), extraído dos relatórios e logs da execução, para conservar a referência mesmo após a expiração dos artefatos.
- ADO: [revisão dos 75 PBIs](RASTREABILIDADE_ADO_2026_10_21.md), com 19 novos fechamentos, 71 Done e quatro New. Os vínculos foram acrescentados/conferidos retrospectivamente em 21/10.

Os níveis indicados são uma avaliação técnica para defesa perante o professor. A escolha dos opcionais, os critérios subjetivos e o aceite dos obrigatórios continuam pertencendo à avaliação acadêmica.

## As seis frentes priorizadas

| Critério e peso | Avaliação anterior | Evidência atual | Nível defensável e pontos | O que falta para avançar |
| --- | --- | --- | --- | --- |
| Cobertura automatizada do frontend — 1,00 | Não contabilizada: faltava medição | Vitest/V8: **52,19% de linhas**, 167 testes em 29 arquivos; relatório publicado e limites na CI | **60% → 0,60** usando linhas como métrica | Chegar a pelo menos 75% para o nível máximo. Se o professor exigir o mínimo em todas as métricas, funções e branches ainda estão abaixo de 50%; nessa interpretação, defender apenas 30% |
| Responsividade e customização — 1,50 | 60% → 0,90 | Temas claro/escuro/automático; painéis em 360, 768 e 1440 px; busca, situação, lista/grade e paginação persistidas por conta/seção; botão de restauração | **100% → 1,50**, com demonstração dos três itens | Mostrar os dois perfis e os resultados dos testes. Persistência é no navegador, sem sincronização entre dispositivos |
| Monitoramento e observabilidade — 1,50 | Não contabilizado | Logs JSON com request ID, métricas protegidas, Prometheus, Grafana, Alertmanager; falha e recuperação de Redis registradas | **60% → 0,90** conservador; base técnica para pleitear 100% | Registrar uso dos indicadores para uma melhoria concreta, a alteração realizada e a verificação posterior. O nível máximo pede feedback contínuo, além das ferramentas |
| Documentação dos serviços backend — 1,00 | 60% → 0,60 | **106 operações em 72 caminhos** com sumário, descrição, tags e respostas; catálogo, Swagger/ReDoc, README de ambiente e execução; schema validado | **60% → 0,60**: itens a e c sustentados; item b precisa de revisão | Atualizar exemplos de payload e demonstrar exemplos executáveis com dados de teste existentes. Há exemplos antigos incompatíveis com regras atuais |
| Cobertura automatizada do backend — 1,00 | Não contabilizada: faltava medição | coverage.py: **93,25% de linhas**, **82,10% de branches** e **91,55% combinado**; 514 testes; barreira combinada de 90% na CI | **100% → 1,00**: as três medidas superam 75% | Apresentar o escopo medido e as exclusões. Esse relatório não mede o modelo ML nem comprova chamadas reais a provedores externos |
| Migrações profissionais — 1,00 | 30% → 0,30 | Django migrations, testes de upgrade com dados anteriores, preenchimento do preço acordado, revisão de plano/SQL e processo de recuperação documentado | **30% → 0,30** comprovado | 60% exige migrações criadas em pelo menos 30% das sprints; 100% exige pelo menos 50%. Falta calendário e associação verificável entre sprint e migração |

A rubrica de cobertura usa os limiares **20% → nível 30%; 50% → nível 60%; 75% → nível 100%**. O percentual de linhas executadas não demonstra, sozinho, a qualidade das asserções. Mostrar também um teste de regra de negócio ou de recuperação de falha.

### Medições da execução remota

| Ferramenta | Métrica | Coberto / total | Percentual |
| --- | --- | ---: | ---: |
| Vitest/V8 | Linhas | 2.385 / 4.569 | 52,19% |
| Vitest/V8 | Instruções | 2.638 / 5.183 | 50,89% |
| Vitest/V8 | Funções | 732 / 1.811 | 40,41% |
| Vitest/V8 | Ramificações | 2.119 / 4.407 | 48,08% |
| coverage.py | Linhas | 6.745 / 7.233 | 93,25% |
| coverage.py | Ramificações | 1.069 / 1.302 | 82,10% |
| coverage.py | Combinado | 7.814 / 8.535 | 91,55% |

Também passaram **126 execuções Playwright** em Chromium, Firefox e WebKit, incluindo **18 execuções** específicas de preferências/responsividade, e **21 testes** do helper DevOps. Os testes de navegador são evidência funcional adicional; não são somados ao percentual de cobertura V8.

O [Vitest](../FrontEnd/vitest.config.ts) inclui os arquivos TS/TSX de `src`, exceto testes e declarações de tipos. O [coverage.py](../BackEnd/.coveragerc) exclui testes, migrações, ambientes virtuais, `ml`, `manage.py` e `seed.py`. Há testes de migração, embora os arquivos de migração não entrem no denominador de cobertura.

### Ressalvas que fazem diferença na defesa

**Documentação — constatação da avaliação inicial:** o schema possuía 13 blocos de exemplos explícitos, mas quantidade não garante atualidade. O exemplo de criação de reserva enviava `total_price`, campo que não integra a entrada gravável: a criação ignora esse valor e calcula o preço; a atualização o recusa. Os exemplos de assinatura não enviavam `revision_id`, necessário quando existe revisão congelada. A validação estrutural do OpenAPI passava sem executar esses exemplos.

**Atualização posterior em 21/10/2026:** essas incompatibilidades foram corrigidas no Swagger. O guia e os exemplos de reserva, OTP/assinatura, recorrência, aditivo, cancelamento e horímetro agora são acompanhados de testes que leem os payloads do schema e executam a API com registros fictícios persistidos no banco de teste. O conjunto de validação teve **21 testes aprovados**; veja [execução e limites da evidência](README_Servicos_Backend.md#exemplos-executáveis-e-apresentação). A matriz acima preserva a avaliação anterior à correção. A evidência nova permite pleitear o item b e o nível de 100% em documentação, sujeito à interpretação da banca sobre “dados reais”; não equivale a comprovação de e-mail ou pagamento externo.

**Observabilidade:** o exercício local mostrou readiness 503, alerta ativo e resolução após recuperar Redis. Isso comprova integração e funcionamento dos alertas. Para defender 100%, acrescentar uma cadeia verificável: indicador/incidente → diagnóstico → melhoria → commit/PR → nova medição. A rubrica não exige expressamente tracing distribuído, email ou hospedagem cloud neste item; a lacuna conservadora é evidência de uso para melhoria contínua. Os limites atuais são logs locais e ausência de aviso externo.

**Migrações:** documentação de processo não substitui frequência histórica. Usar `sprints com pelo menos uma migração pertinente / total de sprints avaliadas`; dez migrações em uma sprint contam como uma sprint. Há quatro linhas sem commit no inventário atual, correspondentes a arquivos presentes no Git; revisar a extração de histórico antes de usá-las como evidência. Não interpretar “não versionado” do gerador como prova de ausência no repositório.

## Critérios obrigatórios

Os **2,50 pontos** dependem da aprovação integral do conjunto. A rubrica diz que a ausência de qualquer obrigatório impede a entrega; a pontuação opcional não substitui esse aceite.

| Obrigatório | Situação atual frente à avaliação anterior | Onde sustentar e o que confirmar |
| --- | --- | --- |
| Pelo menos 80% do escopo acordado | Ainda depende de aceite do escopo; várias falhas antigas foram corrigidas | Matriz de funcionalidades, critérios e testes; confirmar a mudança de T03 no [ADR 0002](adr/0002-preco-por-diaria-e-horimetro-informativo.md). **71/75 cards Done não é medição de escopo**: há cards documentais, de teste e fechamentos com ressalvas |
| Processo ágil e entregas conforme TDE | Rastreabilidade atual ampliada; frequência histórica ainda pendente | [ADO](RASTREABILIDADE_ADO_2026_10_21.md), PRs e CI, ligados às sprints oficiais. Vínculos criados agora não demonstram retrospectivamente todas as cerimônias e revisões |
| Frontend acabado e resistente a erros | Evidência mais forte: retomada de pagamento, chat, preferências e testes de navegador | [Testes de interface](../FrontEnd/tests/README.md), `tenant-dashboard.spec.ts`, `chat.spec.ts`, `contract-management.spec.ts`; demonstrar erro e recuperação em duas contas |
| Backend REST e JSON | Sustentado pela API e pelo schema validado | [Guia dos serviços](README_Servicos_Backend.md), Swagger e uma resposta de sucesso/erro |
| Persistência correta | Falhas de preço, observações e revisão contratual cobertas por regressão | [Preço acordado](../BackEnd/rentals/test_agreed_price.py), [revisões](../BackEnd/contracts/test_revisions.py), [política e observações](../BackEnd/rentals/test_lifecycle.py); apresentar recarregamento e consulta pelo outro perfil |
| Dois perfis e autorização no frontend/backend | Evidência ampliada de locador/locatário e negativas de acesso | [Rotas protegidas](../FrontEnd/src/app/routes/protectedRoutes.tsx), [política de reservas](../BackEnd/rentals/policy.py), [acesso à assinatura](../BackEnd/contracts/test_signature_access.py), matriz de acesso em [chat/tests.py](../BackEnd/chat/tests.py) |
| Dashboard gerencial | Filtros persistidos e ciclo de vida compartilhado implementados e testados | Painéis do locador/locatário, [regras de estado e ações](../BackEnd/rentals/lifecycle.py) e [testes dos painéis](../BackEnd/api/test_dashboard_flows.py); conferir os valores mostrados com os registros de demonstração |
| Git organizado e participação de todos | Histórico e vínculos reais disponíveis | Commits/PRs de cada integrante e cards relacionados. Responsável atribuído no ADO não equivale a autor de um commit |

Continuam abertos os PBIs **8004** (pagamento/comprovante), **8013** (execução periódica da expiração), **8030** (operação em campo pelo operador) e **8047** (retenção automática de mensagens). Os estados Done preexistentes de **8022**, **8052** e **8056** têm ressalvas registradas. Esses pontos devem entrar na conciliação do escopo, sem transformar status do board em prova automática de funcionalidade.

## Comparação dos demais opcionais

Os itens abaixo mantêm a estimativa conservadora de 14/10 quando não houve nova evidência suficiente para alterar o nível. Não representam uma nova auditoria integral de cada integração.

| Critério | Peso | Nível mantido | Pontos | Como defender ou avançar |
| --- | ---: | --- | ---: | --- |
| Modelagem de requisitos por sprint | 1,00 | Não contabilizado | 0,00 | Mostrar BDD/especificações e sua aplicação em 30%, 50% ou pelo menos 80% das sprints |
| Processo de qualidade por sprint | 1,00 | Não contabilizado | 0,00 | Relacionar plano de testes, revisões e resultados às mesmas proporções de sprints; CI verde atual não determina essa frequência |
| Figma e usabilidade | 1,50 | Não contabilizado | 0,00 | Apresentar Figma; para 60%, checklist aplicado; para 100%, também teste filmado com feedback |
| SQL/ORM avançado | 1,50 | 60% | 0,90 | Demonstrar constraints/índices e triggers; para o terceiro item, uma consulta agrupada executada pelo dashboard. Agregação somente no frontend não comprova grouped query SQL/ORM |
| NoSQL avançado | 1,50 | Não contabilizado | 0,00 | Redis para canais/cache não comprova o conjunto JSON Schema, índices e sharding/agregações da rubrica |
| Microsserviços | 1,50 | Não contabilizado | 0,00 | Descrever corretamente o monólito modular; containers PostgreSQL/Redis não são serviços de negócio independentes |
| Service Discovery e API Gateway | 1,00 | Não contabilizado | 0,00 | Fora da arquitetura demonstrada; não apresentar proxy ou URLs configuradas como discovery |
| Serviços cloud | 1,50 | 60% | 0,90 | Manter as evidências de Supabase, Groq e Stripe; registrar operação completa do quarto serviço para pleitear 100% |
| Arquitetura backend | 1,00 | 60% | 0,60 | Mostrar serviço, DTO/serializer e adaptador em uma chamada real; ainda há dependência direta de Django/ORM nas camadas |
| Internacionalização | 1,50 | Não contabilizado | 0,00 | Aplicação continua orientada a português/BRL; tema visual não é troca de idioma |
| Arquitetura frontend | 1,00 | 60% | 0,60 | Mostrar [container](../FrontEnd/src/app/container.ts) e [decoradores HTTP](../FrontEnd/src/shared/http/decorators/AuthenticatedHttpClient.ts); justificar separação e acoplamentos restantes |
| Acessibilidade | 1,50 | 60% | 0,90 | [Estudo de presbiopia](acessbilidade_presbiopia.md) e estratégias aplicadas; falta resultado de teste com o público escolhido |
| CI/CD por ambiente | 1,50 | 30% | 0,45 | CI remota verde e artefatos são comprovados. Os níveis superiores pedem também deploy automatizado e separação de ambientes, ainda não demonstrados |
| Infraestrutura como código cloud | 1,00 | Não contabilizado | 0,00 | Compose local não provisiona recursos cloud. O texto de 30% admite configuração manual, mas esse 0,30 permanece fora da conta conservadora até alinhamento |
| Modelo de imagem CNH | 1,50 | 60% | 0,90 | Mostrar treinamento TensorFlow e integração. Classificação de imagem não equivale a autenticação documental nem a múltiplos agentes |
| Pagamento sandbox completo | 1,50 | Não contabilizado | 0,00 | Gravar Checkout → evento Stripe → webhook → pagamento persistido. Testes com provedor simulado e recorrência de reservas não comprovam pagamento agendado |

## Pontuação e prioridades

Usando a mesma soma simples da avaliação anterior, com **linhas** como métrica de cobertura frontend:

| Componente | Antes | Agora |
| --- | ---: | ---: |
| Seis critérios priorizados | 1,80 | 4,90 |
| Demais opcionais mantidos | 5,25 | 5,25 |
| Soma bruta dos opcionais considerados | **7,05** | **10,15** |
| Obrigatórios, somente se todos aceitos | 2,50 | 2,50 |
| Soma bruta condicionada | 9,55 | 12,65 |

O ganho estimado é **3,10 pontos nos opcionais**. **12,65 não é uma nota final**: a soma depende dos critérios escolhidos e da fórmula/teto da planilha oficial, ausentes no CSV. Se forem aceitos a soma simples e o teto 10 usados anteriormente, há margem para esse teto, condicionada aos obrigatórios e ao aceite das evidências. Se cobertura frontend for avaliada pelo menor percentual entre métricas, a soma dos opcionais cai para 9,85.

Prioridades para a defesa:

1. Confirmar com o professor o escopo de T03 e a matriz dos 80%, além do calendário/TDE das sprints.
2. Corrigir e executar os exemplos de reserva e assinatura; isso pode elevar documentação de 60% para 100% sem ampliar funcionalidades.
3. Conciliar migrações e qualidade com as sprints existentes, usando evidências históricas.
4. Registrar um caso de melhoria orientada pelos indicadores para sustentar observabilidade a 100%.
5. Elevar cobertura frontend a 75% com testes de comportamento das páginas mais descobertas, preservando o escopo de medição.
6. Se pagamento fizer parte dos opcionais escolhidos, registrar a jornada sandbox completa com confirmação por webhook.
