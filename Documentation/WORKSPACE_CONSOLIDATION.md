# Consolidação dos checkouts — 14/10/2026

A branch de trabalho consolidada é `develop_joaofre_locacoes_integradas`, ligada
à [PR #44](https://github.com/joaoson/Frota_Rural/pull/44), com base em `develop`.
O checkout local usado nesta consolidação é
`~/.codex/worktrees/develop-integration/Frota_Rural`.

## Origem e destino do trabalho

| Origem | Evidência e tratamento |
| --- | --- |
| `Frota_Rural`, branch `feature/sugestao-preco-hora-ia` (`7a09e4e`) | As funcionalidades de precificação e mascote já estão adaptadas à arquitetura atual. Os ajustes locais de refresh, JWT, URLs HTTP/WebSocket e erros do Groq também já têm implementação e testes na integração. Preservadas essas versões atuais. |
| `Frota_Rural/ChromeExtension` | Incorporada a extensão, com seletores compatíveis com os campos atuais e os antigos, contas do seed atual, admin configurável e teste real do Chrome com contas descartáveis locais. |
| `Frota_Rural/brag-output` | Incorporados o vídeo, capa, composição, mídias e registros de validação existentes, sem alterar ou renderizar novamente a composição. Cache de miniaturas e log de render ficam locais. |
| `Frota_Rural/.agents/skills/ip-as-logo` | Preservada a skill original com licença, documentação e imagem de referência. |
| `Frota_Rural_retrofit`, branch `develop_joaofre_fluxos_dashboard` (`7e0dca5`) | Todos os commits e os 18 arquivos de frontend modificados/novos já estavam presentes na integração. |
| Correção Stripe do retrofit | Adaptada de `payments/views.py` para `payments/services.py`, incluindo o acesso ao evento e à sessão. Testes usam payload assinado e o parser real do SDK. |
| Documentos não versionados da integração | Incorporados `AVALIACAO_RUBRICA_E_PLANO_DE_EVOLUCAO.md` e `FEATURE_AUDIT_T01_T07.md`, preservando o diagnóstico e o plano de evolução. |

Não foi feito um merge integral do checkout antigo: isso reintroduziria caminhos
substituídos pela organização atual em services, views e features. A base
`084a48c` já continha todo o histórico do retrofit e quatro commits adicionais,
incluindo a integração da arquitetura do backend.

## Configuração local

Credenciais, conexão Supabase, arquivo de serviço Firebase e configuração de
memória foram preservados no checkout consolidado como arquivos ignorados pelo
Git. As integrações também foram transferidas para `.env.local`, mantendo as
configurações de banco/portas do ambiente local. Nenhum segredo vai para a PR.
Os checkouts de origem e seus dados foram preservados.

Use os comandos de [DEVELOPMENT.md](../Devops/DEVELOPMENT.md) a partir do checkout
consolidado. O ambiente local existente usa offset 2 (frontend 5175, API 8002);
use `localhost` de forma consistente com `FRONTEND_URL` e a configuração CORS.
A extensão deve apontar para essa mesma porta no popup.

## Validação desta consolidação

- 382 testes Django, incluindo quatro regressões com o parser real Stripe.
- 101 testes unitários/componentes do frontend, no container Linux.
- 19 testes dos comandos de desenvolvimento.
- Cinco testes de configuração da extensão e um cenário integrado do Chromium:
  três perfis, permissões, restauração da sessão, navegação, popup, conta admin
  não configurada, erro de senha, atualização das contas e largura móvel.
- `manage.py check` sem problemas e `makemigrations --check --dry-run` sem drift.

A tentativa inicial de Vitest no host encontrou uma dependência nativa ausente;
a suíte foi executada com sucesso no container já configurado. A composição e
as mídias transferidas permaneceram iguais às originais; não houve novo render.
