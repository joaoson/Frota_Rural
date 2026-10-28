# Roteiro para demonstrar os requisitos da rubrica

Use este roteiro junto da [comparação de 21/10/2026](COMPARACAO_RUBRICA_2026_10_21.md). Para cada critério, apresente primeiro o resultado que o usuário ou a equipe observa, depois a evidência executável e por último o trecho de código que explica a solução.

## Onde colocar cada explicação

| Local | Conteúdo recomendado |
| --- | --- |
| Apresentação à banca | Uma tabela dos seis critérios com nível pretendido e uma evidência por linha; depois demonstração curta. Não gastar o tempo percorrendo todos os arquivos |
| Relatório/TDE | Nas seções equivalentes a qualidade/testes, interface, serviços backend e DevOps, explicar decisão, método, resultado e limite. Usar os títulos exigidos pelo modelo do curso |
| Repositório | Esta comparação, os guias técnicos, testes, configuração da CI e links dos artefatos publicados |
| Azure DevOps | Em cada card, critério de aceite, comportamento entregue, evidência, commit/PR e diferença de escopo. Identificar a sprint real e a data da revisão |
| GitHub Actions | Mostrar a execução do commit apresentado e abrir os artefatos de cobertura, OpenAPI e Playwright |

Exemplo de texto para um card: “Verificado em 21/10/2026: o painel preserva busca e modo de exibição após recarregar. Evidência: teste `dashboard-preferences.spec.ts`, execução 39612427515 e commit 3933056. Preferências salvas no navegador por conta; não há sincronização entre dispositivos.”

## Preparar as abas e os relatórios

Abrir a [CI aprovada](https://github.com/joaoson/Frota_Rural/actions/runs/39612427515). Em **Artifacts**, baixar `frontend-coverage`, `backend-coverage-and-openapi` e `playwright-report`. Extrair o ZIP inteiro e abrir o `index.html` correspondente; os arquivos auxiliares são necessários para navegação. No artefato Playwright, procurar `FrontEnd/playwright-report/index.html` conforme a estrutura extraída.

Se preferir baixar pela CLI, na raiz do repositório:

```bash
gh run download 39612427515 --dir test-reports/ci-39612427515
```

Não misturar o relatório local de uma execução com os números de outra. Na comparação atual usamos **52,19% de linhas no frontend** e **91,55% combinado no backend**, medidos pela CI desse commit.

Endereços dos ambientes que estavam ativos em 21/10:

| Destino | Stack de demonstração isolada `frota-quality` | Ambiente de desenvolvimento com offset 2 |
| --- | --- | --- |
| Aplicação | `http://localhost:5193` | `http://localhost:5175` |
| Swagger | `http://localhost:8020/api/schema/swagger-ui` | `http://localhost:8002/api/schema/swagger-ui` |
| ReDoc | `http://localhost:8020/api/schema/redoc` | `http://localhost:8002/api/schema/redoc` |
| Readiness | `http://localhost:8020/health/ready` | `http://localhost:8002/health/ready` |
| Grafana | `http://localhost:3000` | `http://localhost:3002`, se iniciado com observabilidade |
| Prometheus | `http://localhost:9090` | `http://localhost:9092`, se iniciado com observabilidade |
| Alertmanager | `http://localhost:9093` | `http://localhost:9095`, se iniciado com observabilidade |

Essas URLs dependem dos containers ativos. Confirme com `docker ps`; não troque portas durante a demonstração. Para iniciar observabilidade no ambiente local com offset 2, siga [OBSERVABILIDADE](../Devops/OBSERVABILIDADE.md), mantendo `--port-offset 2`. Use contas fictícias de locador e locatário em sessões separadas.

## Cobertura automatizada do frontend

**Onde mostrar:** CI → job `frontend-checks` → artefato `frontend-coverage` → `index.html`. No código, [vitest.config.ts](../FrontEnd/vitest.config.ts), [testes de preferências](../FrontEnd/src/features/dashboard/tests/preferences.test.tsx) e os testes das páginas.

**Demonstração de aproximadamente um minuto:** mostrar o total de 167 testes, abrir a linha de cobertura global e entrar em um arquivo para distinguir código executado e não executado. Mostrar a configuração que inclui todo `src` e os limites que fazem a CI falhar em caso de regressão. Explicar que Playwright valida jornadas separadamente.

**Como explicar:** “O frontend tem testes de comportamento com Vitest e medição V8. Nesta execução, 52,19% das linhas foram exercitadas; pela faixa de 50% da rubrica, defendemos o nível de 60% usando linhas. A CI publica o relatório e bloqueia regressões abaixo dos limites configurados.”

**Limite a mencionar:** funções 40,41% e branches 48,08%; não afirmar cobertura de 75% ou nível máximo. Os limites atuais da CI são uma proteção da base, não os limites acadêmicos.

Para reproduzir localmente:

```bash
cd FrontEnd
npm run test:coverage
```

O HTML local fica em `test-reports/frontend/index.html`, relativo à raiz do repositório.

## Responsividade e customização

**Onde mostrar:** locador em `/dashboard?tab=frota`; locatário em `/dashboard-locatario?tab=contratos`. Evidência automatizada: [dashboard-preferences.spec.ts](../FrontEnd/tests/dashboard-preferences.spec.ts). Implementação: [ThemeToggle](../FrontEnd/src/components/ThemeToggle.tsx) e [useDashboardPreference](../FrontEnd/src/features/dashboard/hooks/useDashboardPreference.ts).

**Demonstração de aproximadamente dois minutos:**

1. Alternar o tema claro/escuro e recarregar.
2. No painel do locador, buscar uma máquina, selecionar **Lista** e alterar **Itens por página**. Recarregar e mostrar os valores preservados.
3. Redimensionar para 360 px e abrir o menu móvel. Mostrar que controles e conteúdo continuam acessíveis, sem rolagem horizontal indevida.
4. Selecionar **Restaurar painel** e conferir os valores padrão.
5. Na outra sessão, mostrar busca e filtro **Encerrados** do locatário preservados após recarregar.

**Como explicar:** “A personalização inclui filtros e modo de exibição úteis ao trabalho de cada perfil. Salvamos as preferências por conta e seção no navegador, validamos os dados salvos e oferecemos restauração. Os testes cobrem os dois painéis em três larguras e três navegadores, além dos temas disponíveis.”

**Limite a mencionar:** os 18 casos específicos validam os painéis selecionados, não todas as telas possíveis. A preferência permanece neste navegador; não é sincronizada pelo backend.

## Monitoramento e observabilidade

**Onde mostrar:** Grafana → dashboard **Frota Rural — Operação**; Prometheus → targets e alertas; Alertmanager → incidentes. No código, [instrumentação](../BackEnd/common/observability.py), [regras de alerta](../Devops/observability/alerts.yml), [testes de regras](../Devops/observability/alerts.test.yml) e [guia operacional](../Devops/OBSERVABILIDADE.md).

**Demonstração de aproximadamente dois minutos:** mostrar tráfego, erros e latência p95 no Grafana; acessar uma rota e localizar seu `X-Request-ID` nos logs. Explicar liveness versus readiness. Mostrar os registros do exercício de Redis e a sequência **200 → 503 → alerta ativo → recuperação → alerta resolvido**, preservados em `test-reports/observability/`.

**Como explicar:** “Readiness verifica PostgreSQL e Redis. Prometheus coleta as métricas, Grafana apresenta o comportamento e Alertmanager recebe incidentes. No exercício isolado, a falha do Redis foi detectada e o alerta desapareceu após a recuperação. O request ID permite relacionar uma resposta ao log da requisição.”

**Para sustentar 100%:** levar um registro curto com indicador observado, diagnóstico, melhoria realizada, commit e resultado depois da mudança. O teste de falha comprova detecção/recuperação; ainda falta ligar os indicadores a uma melhoria contínua demonstrável.

Não repetir uma interrupção em ambiente compartilhado. Se a banca pedir exercício ao vivo, usar somente a stack descartável e seguir o procedimento do guia. O receiver local não envia email/Slack; tracing distribuído não está implementado.

## Documentação dos serviços backend

**Onde mostrar:** Swagger ou ReDoc, [catálogo de serviços](SERVICOS_BACKEND_CATALOGO.md), [guia da API](README_Servicos_Backend.md) e [README principal](../README.md). Na CI, abrir **Validate and export API documentation** e o `openapi.json` publicado.

**Demonstração de aproximadamente um minuto:** localizar login, consulta de locações, assinatura e webhook; mostrar sumário, descrição, autenticação, parâmetros e respostas. Abrir a seção de instalação/execução do README. Separar o protocolo [WebSocket do chat](README_Chat_Arquitetura.md) dos endpoints HTTP.

**Como explicar:** “O contrato HTTP tem 107 operações canônicas em 73 caminhos. A CI valida o OpenAPI e um teste exige sumário, descrição, agrupamento e respostas em cada operação. O README explica ambiente e execução; WebSocket e endpoints operacionais têm guias próprios.”

**Atualização do Swagger em 21/10/2026:** reserva sem preço enviado pelo cliente; OTP e assinatura com `revision_id`; exemplos de aditivo, recorrência, cancelamento e horímetro; respostas JSON antes ausentes agora descritas. O guia inicial explica quais IDs guardar e como trocar de conta. O “Try it out” usa a porta em que a página foi aberta.

**Como demonstrar os payloads:** mostre o exemplo de reserva e a suíte [test_documented_examples.py](../BackEnd/common/tests/test_documented_examples.py), que carrega os exemplos do OpenAPI e os executa pela API com registros fictícios persistidos no banco de teste. O conjunto de validação teve **21 testes aprovados**, incluindo assinatura com OTP pelas duas partes e recorrência sem duplicação. Veja o [roteiro detalhado](README_Servicos_Backend.md#exemplos-executáveis-e-apresentação). Isso resolve a incompatibilidade técnica apontada na comparação anterior e acrescenta evidência para o item b; o nível máximo depende de a banca aceitar dados de teste como “dados reais”. E-mail e pagamento externo não foram exercitados por essa suíte.

## Cobertura automatizada do backend

**Onde mostrar:** CI → job `browser-tests` → **Check backend and run regression tests** e **Generate backend coverage reports**; artefato `backend-coverage-and-openapi/index.html`. No código, [configuração da medição](../BackEnd/.coveragerc), [teste de preço acordado](../BackEnd/rentals/test_agreed_price.py) e [teste de revisão imutável](../BackEnd/contracts/test_revisions.py).

**Demonstração de aproximadamente um minuto:** mostrar os 514 testes aprovados, as três métricas e um caso em que editar o anúncio não pode mudar o preço já acordado. Explicar o que falharia se a regressão voltasse. Mostrar o mínimo combinado de 90% configurado na CI.

**Como explicar:** “A medição do backend exercitou 93,25% das linhas e 82,10% das ramificações; o resultado combinado é 91,55%. Todas essas medidas superam os 75% exigidos para o nível máximo. Além da quantidade, temos regressões para preservar preço, assinatura, permissões e repetição segura de pagamentos.”

**Limite a mencionar:** os provedores externos são simulados nos testes apropriados. Migrações e ML não entram no denominador; não afirmar cobertura percentual do projeto inteiro ou realização de pagamento real a partir desse relatório.

Para reproduzir na stack descartável, depois de confirmar o container:

```bash
docker exec frota-quality-backend-1 python -m coverage run manage.py test --noinput
docker exec frota-quality-backend-1 python -m coverage report
```

Os 514 testes já estão registrados na CI; não é necessário executá-los novamente durante a banca.

## Migrações profissionais

**Onde mostrar:** [guia de migrações](README_Database_Migrations.md), [inventário histórico](MIGRACOES_HISTORICO.md), [migração do preço acordado](../BackEnd/rentals/migrations/0003_rental_price_snapshot.py) e [testes de upgrade](../BackEnd/api/test_migration_upgrade.py). Na CI, mostrar a verificação de drift e a suíte que aplica migrations em PostgreSQL de testes.

**Demonstração de aproximadamente um minuto:** explicar a evolução de schema com dependências e preenchimento dos registros antigos. Mostrar o teste que preserva **R$ 3.024** do pagamento aprovado em vez do valor incorretamente recalculado de **R$ 5.040**. Apresentar plano, revisão de SQL e recuperação como etapas do processo; distinguir procedimento documentado de restauração efetivamente demonstrada.

**Como explicar:** “A evolução do banco é versionada e testada com dados de versões anteriores. Neste exemplo, o preenchimento preserva o valor já pago e as relações entre locação e contrato. Para pontuar acima de 30% na rubrica, precisamos também demonstrar em quais sprints essas migrações foram criadas.”

**Evidência que falta organizar:** uma tabela com sprint oficial, período, migração pertinente, commit/PR e resultado da aplicação. Calcular a proporção de sprints cobertas; não usar o total de migrations como substituto. Corrigir as quatro referências sem commit do inventário antes de incluí-las nessa conta.

## SQL/ORM avançado no painel do locador

**Onde mostrar:** locador em `/dashboard`, filtros **Período** e **Máquina**; Swagger → tag **Painéis** → `GET /api/dashboard/lessor`. No código, [rotina PL/pgSQL](../BackEnd/rentals/migrations/0007_lessor_dashboard_monthly.py), [serviço com consultas agrupadas](../BackEnd/rentals/dashboard.py) e [testes](../BackEnd/rentals/test_dashboard.py).

**Demonstração de aproximadamente dois minutos:**

1. No painel, trocar o período para 12 meses e escolher uma máquina. Abrir a aba de rede e mostrar `months`, `machine` e `time_zone` na chamada.
2. Mostrar no gráfico de valores os meses sem movimento com zero e o ranking **Máquinas com maior valor concluído**.
3. Abrir a migração: `generate_series` cria os meses, `GROUP BY` soma valores e média das avaliações, `AT TIME ZONE` separa os meses no fuso de quem consulta.
4. No serviço, mostrar `values("status").annotate(total=Count("id"))`, que vira `GROUP BY status` e alimenta os cartões e o gráfico **Situação das locações**.
5. Mostrar o teste em que uma devolução às 23h30 de 31/01 em Brasília conta em janeiro, mas em fevereiro quando o fuso é UTC.

**Como explicar:** “Os indicadores são calculados no PostgreSQL. A série mensal é uma rotina armazenada, a situação e o ranking são consultas agrupadas do ORM, e um índice parcial cobre as locações concluídas usadas na receita. O navegador só desenha o resultado e guarda os filtros por conta.”

**Limite a mencionar:** a rotina é uma `FUNCTION` PL/pgSQL, porque `PROCEDURE` no PostgreSQL não devolve linhas. Valores são brutos por data de término, sem confirmação de repasse. O card **Contratos** continua contado no navegador a partir da lista de locações.

## Ordem sugerida para a apresentação

| Tempo aproximado | O que apresentar | Mensagem principal |
| --- | --- | --- |
| 1 minuto | Escopo, dois perfis e mudança de T03 | O produto usa diária fixa e horímetro informativo; a alteração precisa estar alinhada ao escopo aceito |
| 2 minutos | Painéis, tema, filtro salvo, mobile e restauração | Responsividade e personalização observáveis |
| 2 minutos | CI, frontend e backend coverage, um teste relevante | Medição reproduzível e proteção contra regressão |
| 1 minuto | Swagger, catálogo e README | Contrato de uso e documentação dos serviços |
| 2 minutos | Grafana e registro de incidente | Detecção, diagnóstico e recuperação |
| 1 minuto | Migração com preservação de preço | Evolução do banco com dados anteriores |
| 2 minutos | Filtros do painel, rotina PL/pgSQL e GROUP BY | Indicadores gerenciais calculados no banco |
| 1 minuto | ADO → commit/PR → CI; pendências | Rastreabilidade atual e limites do escopo |

Ajustar ao tempo autorizado pela banca. As falas podem ser divididas entre os integrantes por domínio de conhecimento; os créditos de implementação devem acompanhar a autoria real dos commits.

## Perguntas prováveis

- **“Vocês têm 100% de cobertura?”** Não. Backend atinge o nível de 100% da rubrica porque ultrapassa o limiar de 75%. O percentual medido é 91,55% combinado. Frontend tem 52,19% de linhas.
- **“Salvar filtro é suficiente para customização?”** A rubrica cita filtros com salvamento; mostrar que a escolha útil persiste após recarregar e pode ser restaurada.
- **“Está monitorado em produção?”** A evidência apresentada é da stack local isolada. Mostrar exatamente esse alcance.
- **“Por que migrações ainda estão em 30%?”** A ferramenta e os testes estão demonstrados; os níveis superiores exigem frequência por sprint, ainda sem denominador oficial conciliado.
- **“Todos os cards Done comprovam os 80%?”** Não. O aceite exige matriz do escopo acordado e suas evidências. Há fechamentos retrospectivos e diferenças documentadas.
- **“OpenAPI válido significa que qualquer exemplo funciona?”** Não. Além da validação estrutural, agora executamos os exemplos críticos por testes da API. No Swagger, UUIDs, datas e OTPs ainda precisam ser substituídos pelos valores do ambiente e da revisão lida.
