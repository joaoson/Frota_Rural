# Monitoramento local

A API expõe saúde, métricas Prometheus e logs JSON de cada requisição de negócio. O overlay versionado adiciona Prometheus, Grafana provisionado e Alertmanager. As portas dos três serviços ficam vinculadas a `127.0.0.1`; a coleta usa um segredo local gerado, não uma credencial de usuário.

## Executar

Na raiz do projeto:

```bash
python3 Devops/observability/setup.py
python3 Devops/dev.py up --mode local --observability
```

Se seu ambiente foi iniciado com `--port-offset 2`, mantenha esse argumento. O offset também desloca as portas de Grafana (3000), Prometheus (9090) e Alertmanager (9093). O helper mantém o mesmo projeto Compose e seus dados; o overlay só é aceito em modo local.

Grafana: usuário `admin`; a senha está em `.observability/grafana-password`. O diretório é privado e ignorado pelo Git. O dashboard **Frota Rural — Operação** é carregado automaticamente, com disponibilidade, dependências, tráfego por rota, erros 5xx, latência p95, memória do processo e alertas ativos. O token de coleta fica em `.observability/metrics-token`; não o copie para logs ou evidências. O setup não substitui segredos existentes.

A stack usa um processo Daphne por container. Métricas estão na memória desse processo e reiniciam com ele. Uma implantação com múltiplos processos precisa configurar a coleta multiprocess do client Prometheus ou coletar uma instância por processo. Esta configuração local não comprova implantação nem operação na nuvem.

## Contratos operacionais

| Endpoint | Acesso | Resultado |
| --- | --- | --- |
| `GET /health/live` | Público | 200 se o processo HTTP responde, sem depender do banco |
| `GET /health/ready` | Público | 200 com PostgreSQL e Redis acessíveis; 503 se algum falhar. Sem credenciais ou mensagens internas |
| `GET /metrics` | Bearer token de coleta | Formato Prometheus; 404 sem segredo configurado, 403 com segredo incorreto |

`frota_http_requests_total{method,route,status}` e `frota_http_duration_seconds{method,route}` usam nomes de rotas, sem UUIDs, query strings, contas ou corpos de requisição. `frota_dependency_up{dependency}` verifica PostgreSQL e Redis a cada scrape. A checagem Redis tem timeout de um segundo; configure também `connect_timeout` do PostgreSQL para seu ambiente. O modo de canais em memória é reservado ao desenvolvimento/testes.

Cada resposta recebe `X-Request-ID`, gerado no servidor, e os logs `frota.requests` registram o mesmo ID, rota, método, status e duração. Para investigar, obtenha o ID da resposta e procure em `docker compose logs backend` usando o mesmo projeto/arquivos do ambiente. Os logs HTTP estruturados não armazenam conteúdo, cookies, tokens ou identidade. Outros loggers do projeto mantêm seu comportamento próprio.

## Alertas e resposta

- **FrotaBackendDown:** scrape falhando por um minuto. Verifique processo, conectividade e segredo de coleta.
- **FrotaDependencyDown:** PostgreSQL ou Redis falhando por um minuto. Confira readiness e o serviço indicado.
- **FrotaHighErrorRate:** mais de 5% de 5xx por dois minutos, com pelo menos 20 requisições em cinco minutos. Correlacione rota e request ID.
- **FrotaHighLatency:** p95 acima de um segundo por cinco minutos. Investigue consultas e provedores.

Prometheus envia os alertas ao Alertmanager e eles aparecem no dashboard. O receiver `local-console` mantém os incidentes disponíveis na interface local; **não envia email, Slack ou SMS**. Um canal de plantão externo e sua entrega precisam ser configurados e testados antes de reivindicar notificações operacionais remotas.

## Validação e exercício

```bash
docker run --rm --entrypoint promtool -v "$PWD/Devops/observability:/rules:ro" -w /rules prom/prometheus:v3.2.1 test rules alerts.test.yml
docker run --rm --entrypoint amtool -v "$PWD/Devops/observability:/rules:ro" prom/alertmanager:v0.28.1 check-config /rules/alertmanager.yml
```

As mesmas verificações estão na CI. O teste Django cobre autenticação das métricas, falhas de dependências, logs sem informações privadas e registro de respostas 500.

Em uma stack **descartável**, com testes de negócio já terminados, pare somente o Redis: readiness deve passar a 503 e `FrotaDependencyDown` deve aparecer após o período configurado. Reinicie o Redis, confira readiness 200 e a resolução do alerta. Guarde os estados, horários e o relatório; não derrube dependências de um ambiente compartilhado para demonstrar.

Limites desta entrega: logs no stdout do container, sem centralização durável; sem tracing distribuído; sem alertas de disponibilidade dos provedores externos ou de WebSocket. [Instrumentação Prometheus](https://prometheus.github.io/client_python/instrumenting/) e [configuração da coleta](https://prometheus.io/docs/prometheus/latest/configuration/configuration/) fundamentam os tipos de métricas e o scrape.
