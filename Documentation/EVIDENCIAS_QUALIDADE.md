# Evidências de qualidade — 21/10/2026

Branch: `develop_joaofre_locacoes_integradas`. Base Git: `3eed0a2`; resultados medidos no working tree com as alterações desta entrega. Esta é uma atualização do diagnóstico de 14/10, não uma certificação de nota. Os limiares de cobertura da rubrica e o calendário oficial das sprints não foram fornecidos.

**Atualização posterior no mesmo dia:** a [CI do commit `8943e1a`](https://github.com/joaoson/Frota_Rural/actions/runs/39612427515) passou e publicou os artefatos. Seus resultados são 52,19% de linhas no frontend e 91,55% combinado no backend. O CSV original da rubrica foi localizado novamente; os limiares estão na [nova comparação](COMPARACAO_RUBRICA_2026_10_21.md). As tabelas abaixo preservam a medição local inicial. Consulte também o [roteiro de apresentação](ROTEIRO_DEMONSTRACAO_RUBRICA.md).

## Resultado por requisito

| Requisito | Entrega e evidência | Limite para avaliação |
| --- | --- | --- |
| Cobertura automatizada do frontend | Vitest/V8, relatórios HTML/JSON/LCOV e barreira de regressão na CI; 167 testes aprovados em 29 arquivos | 52,09% das linhas; não representa cobertura integral nem nota de 100% |
| Responsividade e customização | Preferências de busca, ano, situação, lista/grade e tamanho de página por conta/seção; restauração do painel; correção de overflow de registros longos | 18 execuções específicas aprovadas: locador/locatário × 360/768/1440 px × Chromium/Firefox/WebKit; não equivale a auditoria de todas as telas |
| Monitoramento e observabilidade | Logs JSON com request ID, saúde, métricas protegidas, Prometheus, dashboard Grafana e alertas no Alertmanager | Exercício local comprovado; sem notificações externas, centralização durável de logs ou tracing distribuído |
| Documentação dos serviços backend | 106 operações HTTP em 72 caminhos canônicos, com sumário, descrição, tags e respostas; schema validado sem warnings | Serviços operacionais e WebSocket documentados separadamente; revisar a documentação junto a mudanças futuras |
| Cobertura automatizada do backend | coverage.py com linhas e ramificações, relatórios HTML/JSON/XML; 514 testes aprovados e mínimo combinado de 90% na CI | 93,27% de linhas, 82,10% de ramificações, 91,56% combinado; não cobre integrações reais com provedores externos |
| Migrações profissionais | Inventário extraído do Git, guia de revisão, expansão/backfill/contração, backup/restauração e critérios de implantação; testes em PostgreSQL | Nenhum drift de modelos nem migração pendente no banco local; falta conciliar commits com as sprints e comprovar implantação/recuperação no ambiente alvo |

## Medições reproduzíveis

| Ferramenta / métrica | Coberto / total | Percentual |
| --- | ---: | ---: |
| Vitest — linhas | 2.380 / 4.569 | 52,09% |
| Vitest — instruções | 2.633 / 5.183 | 50,80% |
| Vitest — funções | 730 / 1.811 | 40,30% |
| Vitest — ramificações | 2.115 / 4.407 | 47,99% |
| coverage.py — linhas | 6.746 / 7.233 | 93,27% |
| coverage.py — ramificações | 1.069 / 1.302 | 82,10% |
| coverage.py — combinado | 7.815 / 8.535 | 91,56% |

O frontend inclui todo `src/**/*.{ts,tsx}`, exceto testes e declarações de tipos. O backend mantém o escopo da configuração existente: exclui testes, migrações, ambientes virtuais, `ml`, `manage.py` e `seed.py`. As métricas não foram elevadas pela retirada de módulos de negócio do denominador. Os testes Playwright não entram no percentual V8 de testes unitários.

Na pasta `FrontEnd`:

```bash
npm ci
npm run lint
npm run build
npm run test:e2e:typecheck
npm run test:coverage
# Com uma stack local descartável já iniciada:
E2E_BASE_URL=http://localhost:5193 E2E_API_URL=http://localhost:8020/api/ E2E_BACKEND_CONTAINER=frota-quality-backend-1 npm run test:e2e
```

No container backend da stack local descartável (não executar testes no banco hospedado):

```bash
python -m pip install -r docs/requirements-coverage.txt
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --check
python -m coverage run manage.py test --noinput
python -m coverage html
python -m coverage json
python -m coverage xml
python -m coverage report
python manage.py spectacular --validate --fail-on-warn --format openapi-json --file coverage-report/openapi.json
```

Artefatos locais, ignorados pelo Git: `test-reports/frontend/`, `BackEnd/coverage-report/`, `FrontEnd/playwright-report/`, `FrontEnd/test-results/`. A suíte completa Playwright aprovou **126 execuções** em três navegadores. Build, lint, tipos de testes, verificações Django, 21 testes do helper DevOps e regras de alertas também passaram. O build ainda avisa sobre um bundle maior que 500 kB; essa otimização não foi feita nesta entrega.

A [pipeline](../.github/workflows/playwright.yml) está configurada para publicar cobertura frontend, cobertura backend/OpenAPI e evidências Playwright. As medições deste documento são locais; o resultado remoto deve ser conferido na execução do GitHub Actions correspondente ao commit publicado. Os limiares frontend (50% instruções, 47% ramificações, 40% funções, 51% linhas) são barreiras contra regressão da base atual, não critérios oficiais de aprovação acadêmica.

## Exercício de observabilidade

Ambiente isolado `frota-quality`, sem credenciais reais de pagamentos ou email, em 21/10/2026:

1. Prometheus coletou a API com target UP; readiness retornou 200 com PostgreSQL/Redis saudáveis.
2. Foi parado somente `frota-quality-redis-1`, após a suíte de negócio terminar. Readiness retornou 503 com `redis: false`, sem detalhes internos.
3. `FrotaDependencyDown{dependency="redis"}` passou a pending às 13:28:16 UTC e firing às 13:29:16 UTC; o Alertmanager recebeu o incidente como active.
4. Redis foi reiniciado e readiness voltou a 200. Após a próxima avaliação/coleta, as consultas de alertas ativos de Prometheus e Alertmanager retornaram listas vazias, confirmando resolução.

Respostas coletadas ficam em `test-reports/observability/`. O ambiente de desenvolvimento habitual não teve seus serviços interrompidos. Veja comandos, painel, segurança das métricas e procedimento em [OBSERVABILIDADE](../Devops/OBSERVABILIDADE.md).

## Documentação e migrações

- [Guia dos serviços](README_Servicos_Backend.md) e [catálogo completo](SERVICOS_BACKEND_CATALOGO.md).
- [Processo de migrações](README_Database_Migrations.md) e [histórico verificável](MIGRACOES_HISTORICO.md).
- Regenerar na raiz: `python3 Devops/service_catalog.py` e `python3 Devops/migration_inventory.py`.

A suíte Django cria um banco PostgreSQL de testes e aplica as migrações. `makemigrations --check --dry-run` retornou “No changes detected”; `migrate --check` passou. Não foi criada migração artificial para aparentar atividade em uma sprint. Datas de commits não são datas de aplicação do banco.

## Rastreabilidade no Azure DevOps

Atualizações registradas em 21/10/2026, preservando datas e autoria anteriores:

- [8054 — Advertência de usuário](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/8054): vínculo retrospectivo com [PR 22](https://github.com/joaoson/Frota_Rural/pull/22); Carlos e estado Done já existentes.
- [7983 — Aprovação de operador](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/7983): vínculo com [PR 36](https://github.com/joaoson/Frota_Rural/pull/36); Tiago e estado Done já existentes.
- [8209 — Filtros de Frota](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/8209): encerrado após validação, com referência ao [PR 44](https://github.com/joaoson/Frota_Rural/pull/44) e testes; responsável João preservado.
- [8251 — Pipeline](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/8251): revisão atribuída a Carlos; aberto até coleta da execução remota.
- [8242 — Documentação DevOps](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/8242): revisão atribuída a Tiago; aberto até revisão e conciliação com o calendário das sprints.
- [8005 — Feedback de pagamento malsucedido](https://dev.azure.com/pucpr-estudantes/BSI_2026_1SEM_7U_EQ10/_workitems/edit/8005): revisão atribuída a Amanda; posteriormente encerrado pela entrega de feedback/retry sem duplicação, com a diferença de escopo registrada: a reserva provisória continua recuperável. Isso não comprova pagamento externo nem emissão de comprovante, ainda tratados no PBI 8004.

A [revisão completa dos 75 PBIs](RASTREABILIDADE_ADO_2026_10_21.md) registra 19 novos fechamentos, 71 Done e quatro New, todos com commits relacionados. Os níveis da rubrica e o escopo aceito não são determinados apenas pelos estados dos cards.

Esses registros comprovam a organização atual e os vínculos com entregas reais. Não comprovam por si só que o processo foi praticado em todas as sprints.
