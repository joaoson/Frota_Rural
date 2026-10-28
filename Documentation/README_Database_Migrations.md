# Migrações de banco de dados

O schema é versionado por Django migrations. O [histórico extraído do Git](MIGRACOES_HISTORICO.md) lista arquivo, operações, commit, data e autoria. Uma data de commit não comprova aplicação no banco nem utilização em determinada sprint; essa correspondência deve ser confirmada no ADO.

## Módulos atuais

| Dados | App |
| --- | --- |
| Usuários | `users` |
| Recuperação de senha | `authentication` |
| Máquinas / anúncios e fotos | `machines` / `postings` |
| Locações, preço acordado e horímetro | `rentals` |
| Séries de recorrência | `api` |
| Contratos, revisões, aceites, OTP e propostas | `contracts` |
| Pagamentos, tentativas, eventos e estornos | `payments` |
| Conversas, mensagens e denúncias | `chat` |
| Notificações | `notifications` |
| Avaliações | `reviews` |
| CNH / certificações | `document_validation` |
| Moderação | `administration` |

## Alteração profissional

1. Altere o model do domínio e gere `python manage.py makemigrations <app> --name <finalidade>`.
2. Revise dependências e SQL com `python manage.py sqlmigrate <app> <numero>`. Não reescreva uma migration que já foi compartilhada/aplicada.
3. Para adicionar campos obrigatórios em tabelas com dados, use expansão (campo opcional), preenchimento com `RunPython` e depois restrição. Use `apps.get_model` no preenchimento histórico; não importe o model atual.
4. Determine custo de locks e volume. Operações longas precisam de estratégia própria, como lotes e índices concorrentes em migration não atômica. Não assuma que toda alteração é instantânea.
5. Escreva um teste de upgrade com dados anteriores quando a migração transformar dados ou relacionamentos. Valide valores e FKs, além de conferir que o comando termina.
6. Execute em PostgreSQL descartável: `check`, `makemigrations --check --dry-run`, `migrate --plan`, `migrate --noinput` e testes. A CI aplica desde banco vazio e executa os testes de upgrade.
7. Registre o commit/PR e o item real da sprint. Atualize o ledger com `python3 Devops/migration_inventory.py` na raiz do repositório.

## Antes de aplicar em um ambiente existente

Na raiz, use o helper com o ambiente explicitamente escolhido:

```bash
python3 Devops/dev.py check-db --mode local
python3 Devops/dev.py plan-migrations --mode local
python3 Devops/dev.py migrate --mode local
```

Confirme a identidade do banco com `verify_database`, revise o plano, interrompa escritas quando necessário e faça um backup consistente **antes** da alteração. Para PostgreSQL, `pg_dump --format=custom` gera um arquivo que pode ser restaurado com `pg_restore` em **outro banco vazio**. Credenciais ficam no ambiente ou em `.pgpass`, não no histórico de comandos. Mantenha os backups fora do Git e confira a restauração, contagens e relações relevantes.

O modo Supabase exige `--allow-remote` para escrita. Isso é uma proteção do helper, não uma autorização para migrar sem conferir o destino. Testes automatizados nunca devem usar Supabase. Após a aplicação, execute `migrate --check`, saúde da aplicação e uma jornada essencial.

## Rollback e recuperação

- Revise `migrate <app> <migration_anterior> --plan` antes de qualquer reversão. Dependentes de outros apps também podem ser revertidos.
- Um `reverse_code` que apenas retorna não recupera dados alterados. Não trate uma migration como reversível só porque Django permite executá-la ao contrário.
- Snapshot financeiro, revisão contratual e obrigações de pagamento exigem preservação de dados: prefira correção progressiva. Reverter apenas a imagem da aplicação não reverte schema nem dados.
- Para perda ou corrupção de dados, restaure o backup em banco separado, valide e planeje a troca. Nunca faça uma tentativa de restore destrutivo diretamente no banco em uso.
- Não use `--fake` para esconder divergência de schema; ele altera apenas o histórico de execução.

## Evidências existentes

`BackEnd/api/test_migration_upgrade.py` usa `MigrationExecutor` e cobre duas histórias reais anteriores à integração: recorrência/notificações e extração de `rentals`. Verifica que locação, contrato, participante, série e notificação mantêm suas relações. Também valida o preenchimento do preço acordado a partir do pagamento aprovado, preservando R$ 3.024 em vez do preço recalculado incorreto de R$ 5.040.

`rentals.0007_lessor_dashboard_monthly` cria a rotina PL/pgSQL do painel do locador com `RunSQL` e `reverse_sql`, e o índice parcial `rentals_finished_end_idx`, declarado também no model para que a verificação de drift o enxergue. `LessorDashboardMigrationTests` volta para `rentals.0006`, confirma que rotina e índice saíram e reaplica a migração.

Esses testes restauram o estado mais recente no cleanup e rodam no banco de testes descartável. Não criamos migrations artificiais nesta entrega: as mudanças de preferências e observabilidade não precisam alterar o banco.

Referência: [migrations no Django 6.0](https://docs.djangoproject.com/en/6.0/topics/migrations/).
