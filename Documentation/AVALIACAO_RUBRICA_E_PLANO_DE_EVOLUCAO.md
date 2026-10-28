# Diagnóstico funcional, avaliação do TCC e plano de evolução

**Projeto:** Frota Rural\
**Data da avaliação:** 14/10/2026\
**Versão analisada:** `084a48ccdefd263c6647035979eab64e58d4e973`\
**Branch:** `develop_joaofre_locacoes_integradas`\
**Estado:** avaliação e planejamento; as correções propostas abaixo ainda precisam ser implementadas e validadas.

Este documento reúne o estado das funcionalidades, os problemas que afetam os usuários, as melhorias propostas e a avaliação pela rubrica. O diagnóstico funcional se refere à versão indicada acima; a existência de uma tela ou endpoint não significa que todo o processo esteja concluído.

> **Atualização de 21/10/2026:** as seis frentes de cobertura frontend/backend, responsividade/customização, observabilidade, documentação dos serviços e migrações receberam implementação, medições e documentação na branch atual. Consulte [Evidências de qualidade](EVIDENCIAS_QUALIDADE.md). O diagnóstico e a pontuação abaixo permanecem como registro de 14/10; não representam uma nova avaliação do working tree. Os resultados medidos não foram convertidos em nota sem os limiares e o calendário oficial da rubrica.

> **Nova comparação:** o CSV original foi localizado novamente e os limiares de cobertura foram confirmados. A [comparação de 21/10](COMPARACAO_RUBRICA_2026_10_21.md) usa a CI aprovada do commit `8943e1a`, atualiza os níveis defendíveis e aponta as pendências. O [roteiro de demonstração](ROTEIRO_DEMONSTRACAO_RUBRICA.md) indica onde mostrar cada evidência e como explicá-la. O calendário de sprints continua pendente de conciliação.

## 1. Estado das funcionalidades T01–T07

### Visão geral

| Código | Funcionalidade | Estado atual | Principal trabalho restante | Etapas do plano |
| --- | --- | --- | --- | --- |
| T01 | Alugar maquinário anunciado | Fluxo principal implementado, com falhas de integridade | Preservar valores acordados, alinhar regras de reserva, persistir observações e recuperar tentativas de pagamento incertas | 1, 2 e 4 |
| T02 | Gerenciar contratos de locação | Parcial | Cancelamento pago com estorno, solicitação/aprovação de alterações e fluxo de devolução/conclusão | 2 e 3 |
| T03 | Cobrar horas excedentes pelo horímetro | Fluxo não implementado | Captura e confirmação de leituras, cálculo, cobrança adicional e encerramento | 1 e 3 |
| T04 | Aceitar digitalmente o contrato | Aceite implementado, com falhas na integridade do documento | Preservar uma revisão imutável e vincular os dois aceites e o OTP à revisão correta | 1 e 2 |
| T05 | Receber notificações da locação | Escopo básico implementado para os eventos existentes | Acrescentar eventos dos novos fluxos e, futuramente, preferências e outros canais | 2, 3 e 4 |
| T06 | Programar recorrência de aluguel | Escopo básico implementado | Facilitar retomada da série e entendimento de pagamentos/expiração; evoluir edição e cancelamento por ocorrência | 4 e evolução posterior |
| T07 | Conversar pelo chat interno | Comunicação básica implementada, com falhas de recuperação | Corrigir leitura, histórico, reconexão, confirmação de envio e atualização da caixa de entrada | 4 |

As etapas citadas estão descritas na seção **Plano de execução por prioridade**. Melhorias de T05 e T06 não devem ser confundidas com funcionalidades básicas ausentes; ambos atendem ao escopo básico auditado, embora dependam da qualidade do restante do ciclo de locação.

### T01 — Alugar maquinário em anúncio

**Objetivo do usuário:** escolher uma máquina e um período, conhecer o valor, confirmar a reserva e pagar o valor exigido.

**Disponível hoje:** consulta de disponibilidade, bloqueio de períodos ocupados, cálculo no servidor, reserva provisória, criação do contrato e redirecionamento ao Stripe Checkout. O webhook confirma o pagamento; o retorno à aplicação permite acompanhar pagamento pendente, aprovado, expirado ou em análise e retomar tentativas compatíveis.

**Falhas e limites:**

- O preço de uma locação paga pode ser recalculado por atualização com o mesmo anúncio após mudança da tarifa. Na reprodução, o total passou de R$ 3.024 para R$ 5.040, mantendo o pagamento original.
- As observações digitadas na reserva não são enviadas/persistidas.
- A interface exige antecedência de sete dias, enquanto a API aceita datas futuras mais próximas. As regras de perfil e autorreserva também divergem.
- A criação de Checkout não reconcilia adequadamente uma operação cujo resultado externo ficou incerto; repetir pode criar outra sessão não associada à tentativa original.
- O cálculo atual cobra oito horas por dia de calendário inclusivo, mais 5%. Ainda é necessário definir se isso corresponde ao pagamento mínimo pretendido ou se deve existir caução reembolsável separada.

**Próxima entrega:** preço preservado desde a confirmação aplicável, política única de reserva, observações persistidas e tentativas de pagamento recuperáveis. A sugestão de preço de um anúncio não deve alterar uma locação já acordada.

**Critério de aceite funcional:** reservar, pagar em sandbox e recarregar a página preserva reserva, observações e valor; alterações posteriores do anúncio não mudam o acordo; conflitos concorrentes não confirmam a mesma máquina no mesmo período; acesso direto à API respeita a política aprovada.

### T02 — Gerenciar contratos de locação

**Objetivo do usuário:** encontrar e consultar seus contratos, cancelar quando permitido e negociar alterações antes do aceite.

**Disponível hoje:** listagem e visualização limitadas aos participantes, documento para impressão, evidências de assinatura e cancelamento de reserva pendente sem pagamento impeditivo. Esse cancelamento atualiza o contrato e libera a disponibilidade.

**Falhas e limites:** cancelamento durante Checkout, de locação paga/ativa ou assinada não está disponível; não existe fluxo de estorno. Editar diretamente alguns campos de uma reserva não paga não equivale a solicitar uma alteração contratual com aprovação da outra parte. Também falta a ação normal de devolução/conclusão no dashboard do locador, embora exista atualização genérica no backend.

**Próxima entrega:** ações explícitas de solicitar alteração, comparar mudanças, aprovar/rejeitar, cancelar e acompanhar estorno. Cada alteração aprovada deve gerar uma revisão, revalidar disponibilidade e tratar eventual diferença de valor. A devolução deve se integrar ao horímetro e ao encerramento financeiro.

**Critério de aceite funcional:** ambas as partes acompanham a mesma situação; uma solicitação recusada mantém o contrato anterior; um cancelamento repetido não duplica estorno; a interface distingue pedido de estorno de dinheiro efetivamente devolvido; as datas são liberadas no momento definido pela política.

### T03 — Calcular e cobrar horas excedentes

**Objetivo do usuário:** registrar o uso real da máquina e pagar ou receber a diferença quando o horímetro superar as horas contratadas.

**Disponível hoje:** campos de horímetro inicial e final no backend. A projeção de custo apresentada na análise de locação não é uma medição real nem uma cobrança de excedente.

**Falhas e limites:** faltam telas de entrega/devolução, confirmação das leituras, cálculo oficial, cobrança adicional e acompanhamento de quitação. Leituras negativas ou decrescentes são aceitas. A conclusão pelo backend pode ocorrer sem leituras e sem os aceites necessários.

**Próxima entrega:** fluxo completo de entrega → leitura inicial → devolução → leitura final → confirmação/contestação → apuração → cobrança, se houver → encerramento. Como proposta a validar, `horas excedentes = máximo(0, leitura final − leitura inicial − horas incluídas)`, com tarifa e regra de arredondamento preservadas no contrato. Essa fórmula ainda não representa um fluxo entregue.

**Critério de aceite funcional:** uso dentro da franquia não gera cobrança; excedente confirmado gera exatamente a diferença prevista; inconsistência de leitura exige correção/contestação; falha no pagamento não aparece como quitação; repetir uma operação não gera cobrança duplicada. A devolução física e a situação financeira devem ser visíveis separadamente.

### T04 — Realizar aceite digital de contrato

**Objetivo do usuário:** ler os termos, confirmar sua identidade conforme o processo da plataforma e registrar o aceite do mesmo documento que a outra parte recebe.

**Disponível hoje:** assinatura pelas duas partes, verificações de participante e pagamento, OTP por email, registro de identidade/data/hash e outros dados de evidência, atualização de status e notificações. Há proteções contra alteração comum dos registros de assinatura.

**Falhas e limites:** o documento é reconstruído com dados atuais. Alterar endereço ou anúncio pode modificar o conteúdo mostrado depois do primeiro aceite. As duas assinaturas podem ter hashes diferentes e, ainda assim, concluir o contrato. Também é possível assinar uma versão diferente da exibida antes do envio. Foram identificadas inconsistências entre email do OTP e email registrado na evidência, além de confiança indevida em cabeçalho de IP enviado pelo cliente.

**Próxima entrega:** revisão imutável contendo os termos completos, incluindo cláusulas, identificação da revisão exibida no pedido de aceite, OTP vinculado à identidade/revisão e comprovante recuperável. Após erro de rede, a interface deve consultar o resultado antes de informar que a assinatura falhou.

**Critério de aceite funcional:** as partes assinam a mesma revisão; uma mudança posterior de cadastro não altera o documento histórico; uma revisão desatualizada exige nova leitura; o comprovante continua consultável após recarregar a página. Esta avaliação trata da consistência técnica, não certifica validade jurídica do contrato.

### T05 — Receber notificações sobre a locação

**Objetivo do usuário:** acompanhar mudanças na reserva, no pagamento e no contrato sem precisar abrir cada registro individualmente.

**Disponível hoje:** sino e central com dados persistidos, contador de não lidos, filtros, paginação, leitura individual/em lote, exclusão da caixa e links para o assunto. Os eventos são gravados junto à alteração de negócio e protegidos contra duplicação, com isolamento por destinatário.

**Limites atuais:** a consulta ocorre a cada 30 segundos enquanto a página está visível e ao recuperar foco. Não há entrega externa por email, SMS ou push. Mensagens do chat têm contador próprio; não devem ser apresentadas como eventos já unificados ao sino. A passagem do prazo de uma reserva, isoladamente, não executa um agendador de avisos. Estorno, proposta de alteração e excedente dependem da implementação dos respectivos fluxos.

**Próxima entrega:** acrescentar os eventos novos assim que existirem, mantendo links e textos coerentes com o status real. Preferências, lembretes e canais externos são evoluções posteriores, com controle de falha/repetição de entrega.

**Critério de aceite funcional:** um evento real gera o aviso correto para cada participante, sem acesso por terceiros; repetir webhook não duplica nem faz reaparecer aviso excluído; leitura/exclusão sobrevive ao recarregamento; o link abre a locação ou revisão correspondente. Uma alteração revertida no banco não deixa aviso de sucesso.

### T06 — Programar recorrência de aluguel

**Objetivo do usuário:** reutilizar dados de uma locação própria para reservar a máquina em várias ocasiões futuras.

**Disponível hoje:** no dashboard do locatário, é possível escolher primeira data, frequência semanal/quinzenal/mensal e entre 2 e 12 novas reservas. A prévia informa períodos e preços atuais; a criação revalida disponibilidade, considera intervalos de limpeza e cria toda a série em uma única transação. Repetir a mesma tentativa não duplica a série. Cada ocorrência recebe contrato novo e pagamento independente.

**Limites atuais:** é uma série finita, sem renovação infinita nem débito automático. As reservas provisórias têm prazo inicial de 30 minutos, e cada ocorrência exige pagamento separado. Não há tela completa para reabrir/gerenciar a série, cancelar ocorrências em lote ou aplicar uma alteração às futuras. O preço antigo da locação de origem não é uma garantia para as novas datas.

**Próxima entrega:** visão agrupada com datas, valores e estados de pagamento, retomada fácil após fechar o diálogo e explicação de expiração. Depois de definir cancelamento/estorno, oferecer ações com escopo claro: esta ocorrência, futuras elegíveis ou toda a série elegível. Melhorar a confirmação de séries longas sem prometer pagamentos automáticos inexistentes.

**Critério de aceite funcional:** conflito em uma ocorrência impede criação parcial; repetir após perda de resposta recupera a mesma série; fim de mês e ano bissexto preservam a regra escolhida; cada contrato começa sem assinaturas copiadas; o usuário identifica quais ocorrências estão confirmadas, não pagas ou com prazo vencido.

### T07 — Conversar via chat interno

**Objetivo do usuário:** conversar com as partes autorizadas da negociação/locação, receber novas mensagens e consultar o histórico.

**Disponível hoje:** conversas vinculadas a anúncio/locação, autorização por participante, mensagens persistidas, comunicação em tempo real com WebSocket/Redis, contador de não lidas, envio otimista, moderação e alternativa HTTP. Há endpoint de histórico paginado.

**Falhas e limites:** mensagens recebidas com a conversa aberta podem continuar não lidas; a interface não recupera mensagens anteriores às primeiras 50; reconexão pode perder as primeiras mensagens de uma conversa antes vazia. A auditoria também identificou caminhos de repetição sem confirmação ao remetente, caixa de entrada do dashboard desatualizada e erros de socket sem orientação ao usuário.

**Próxima entrega:** sincronização compartilhada entre página de mensagens e dashboard, paginação visível, recuperação por cursor, leitura vinculada à visualização e estados claros de enviando/enviado/falha. A repetição deve recuperar o resultado de uma mensagem já persistida.

**Critério de aceite funcional:** em duas sessões, mensagens chegam e contadores refletem leitura; aba oculta não marca leitura indevidamente; histórico com 120 mensagens e lista com 60 conversas permanecem acessíveis; reconectar recupera a primeira mensagem recebida offline; perder a confirmação e reenviar mantém um único registro e atualiza seu estado corretamente. Mudanças na locação enquanto o chat está aberto devem atualizar as permissões de envio e explicar eventuais restrições, preservando o histórico autorizado.

## 2. Funcionalidades de apoio e integrações

Este inventário complementa T01–T07. Ele reúne o que foi localizado ou validado nas revisões anteriores e o trabalho recomendado; não representa nova validação integral de cada módulo.

| Área | Capacidade atual | Evolução ou validação necessária |
| --- | --- | --- |
| Cadastro, login e recuperação | Telas e autenticação Django, perfis e rotas protegidas; recuperação de senha integrada ao serviço de email | Validar entrega real de email, expiração/uso único dos links, troca de conta e permissões equivalentes na API. Supabase é usado como banco, não como substituto do login Django. |
| Máquinas, anúncios e busca | Cadastro/gestão pelo locador, pesquisa pública, detalhes e calendário de ocupação | Validar ciclo publicar/editar/inativar com reservas existentes, mensagens de indisponibilidade e preservação dos contratos históricos. |
| Fotos dos anúncios | Upload e exclusão integrados ao Firebase | Demonstrar upload completo e recuperação de falhas; verificar que edição/exclusão de um anúncio não altera evidências históricas necessárias. A checagem anterior do bucket não equivale a upload concluído. |
| Sugestão de preço por IA | Groq pesquisa referências; o motor calcula a tarifa e mostra composição. Existe estimativa identificada quando falta preço público do equivalente novo | Manter fontes/premissas visíveis e confirmação do locador ao aplicar o valor; testar ausência de referências, limites do provedor, respostas atrasadas e mudança de máquina. O caso S790 já teve teste real registrado, sem garantir disponibilidade contínua do serviço. |
| Dashboards do locador/locatário | Listas, ações, gráficos, filtros e indicadores alimentados por dados persistidos | Corrigir significado de locação ativa, atualização após eventos e separação entre valor previsto, recebido e pendente; salvar filtros úteis. |
| CNH e documentos | Upload, modelo de classificação integrado e fluxo de análise administrativa | Demonstrar casos válidos/inválidos, tratamento de falhas e revisão humana; registrar métricas e limites. Classificar uma imagem como CNH não comprova autenticidade nem identidade. |
| Ajuda, termos, privacidade e 404 | Páginas públicas e navegação de apoio, com identidade visual e mascote | Manter conteúdo coerente com funções entregues, links válidos, retorno da página 404 e acessibilidade em mobile. |
| Dados de demonstração e ambientes | Seed repetível, PostgreSQL local e configuração Supabase; CI isolada | Distinguir dados fictícios de operação real, manter testes no banco local e verificar recuperação após indisponibilidade. Escolher uma branch não sincroniza dados nem publica a aplicação. |

## 3. Fluxos completos a demonstrar

O objetivo é validar jornadas com início, resultado e recuperação de falha, além de verificar botões isolados. Os cenários abaixo devem usar contas e dados de teste controlados; as pendências impedem tratá-los como integralmente aprovados hoje.

| Jornada | Sequência esperada | Situação e evidência necessária |
| --- | --- | --- |
| Publicar e encontrar uma máquina | Locador cadastra → publica com foto e preço → locatário encontra → consulta disponibilidade | Capacidade existente; registrar upload completo, visibilidade e edição coerente do anúncio. |
| Reservar, pagar e assinar | Locatário escolhe datas → confirma preço → paga em sandbox → webhook atualiza → ambas as partes assinam a mesma revisão | Fluxo principal existente; depende de corrigir preço/revisão e registrar pagamento completo e entrega de OTP. |
| Cancelar e devolver valores | Participante solicita → política é aplicada → datas são liberadas no momento definido → estorno é confirmado ou acompanhado | Completo apenas para cancelamento pendente sem pagamento impeditivo; falta fluxo pago e estorno. |
| Negociar alteração | Parte propõe → outra compara e decide → disponibilidade/preço são revalidados → nova revisão entra em vigor | Ausente como processo de proposta/aceite; não substituir por PATCH direto. |
| Entregar, devolver e encerrar | Leituras e evidências → confirmação do uso → excedente, se houver → cobrança/quitação → encerramento | T03 e interface de devolução/conclusão ainda pendentes. |
| Reservar várias ocasiões | Escolher origem → consultar prévia → criar série → pagar ocorrências → retomar e acompanhar | Criação básica entregue; falta acompanhamento agrupado e experiência clara de expiração/pagamento parcial. |
| Conversar e acompanhar eventos | Trocar mensagens → receber aviso → abrir assunto → marcar leitura → recuperar após desconexão | Notificações básicas entregues; chat exige correções de leitura, histórico e recuperação. |
| Recuperar acesso e continuar | Solicitar recuperação → receber email → redefinir senha → entrar → retomar reservas/contratos | Capacidade presente; demonstração externa de email e retomada ainda deve ser registrada. |

### Coerência do ciclo de locação

Atualmente, pagamento aprovado leva a locação a `active`, e os dois aceites levam a `signed`. O contador de locações ativas do locatário considera somente `active`, enquanto o locador utiliza outro conjunto de estados. Assim, assinar pode retirar uma locação do contador sem encerrar seu uso ou removê-la da lista de locações correntes.

Antes de ampliar os painéis, definir os conceitos apresentados ao usuário: reserva provisória, aguardando pagamento, aguardando aceites, pronta para entrega, em uso, devolvida, aguardando acerto financeiro, concluída e cancelada. Esta é uma proposta de organização do fluxo; não significa que todos esses estados já existam no código ou que precisem ser uma única enumeração. Situação financeira, disponibilidade da máquina e execução da locação devem poder ser compreendidas separadamente.

**Aceite da integração entre funcionalidades:** com as mesmas locações, conferir para ambos os perfis os contadores, filtros, gráficos, calendário e ações disponíveis antes e depois de pagamento, aceite, devolução, cancelamento e quitação. Uma reserva futura não deve ser apresentada como máquina já em uso; uma devolução não deve ser apresentada como cobrança quitada sem confirmação.

**Melhorias posteriores ao fechamento dos fluxos essenciais:** comprovante histórico do contrato para download, filtros e paginação de contratos, central de acompanhamento de séries, lembretes de entrega/devolução e preferências de notificação. Essas propostas devem entrar no backlog com critérios de aceite e dependências; não são anunciadas aqui como funcionalidades já entregues.

## 4. Resultado e limites da estimativa pela rubrica

A estimativa conservadora é de **7,05 pontos nos critérios opcionais**. Com a aprovação integral dos obrigatórios, que valem **2,50 pontos**, a projeção chega a **9,55 pontos**. Outras evidências podem levar a projeção ao teto de 10.

**Hoje, a entrega ainda tem pendências obrigatórias. Os 9,55 pontos são uma projeção condicionada, não uma nota atual garantida.** A rubrica informa que a falta de qualquer obrigatório impede a entrega, mesmo que a soma dos opcionais seja suficiente.

Premissas da conta:

- Fonte: exportação `QUARTA_TCC_Acompanhamento_Amanda_Carlos_Joao_Tiago_(Rubricas).csv`, fornecida pelo aluno. O CSV contém os pesos e níveis de atendimento, mas não preserva as fórmulas da planilha original.
- A projeção usa a soma dos critérios aplicáveis e assume nota máxima 10. Confirmar com o professor os critérios escolhidos, a forma de agregação e o teto.
- Cada item recebe o peso multiplicado pelo nível de atendimento: 30%, 60% ou 100%. Itens sem comprovação suficiente ficam fora da conta conservadora.
- Os critérios subjetivos dependem de validação do professor. A avaliação técnica do código não substitui essa validação.
- O valor zero e as respostas “Não” presentes no CSV não constituem uma avaliação automática do repositório.
- A análise considera código, documentação, histórico e evidências anteriores. Nenhum novo teste funcional ou pagamento externo foi executado para escrever este documento.

| Componente | Pontos | Condição |
| --- | ---: | --- |
| Opcionais considerados nesta avaliação | 7,05 | Estimativa técnica sujeita ao aceite das evidências |
| Obrigatórios | 2,50 | Somente após aprovação de todos os itens |
| Projeção conservadora | **9,55** | Entrega apta e critérios aceitos pelo professor |
| Projeção com evidências adicionais | **Até 10,00** | Considerando o teto assumido e sem duplicar critérios |

## 5. Critérios obrigatórios

Os obrigatórios formam um conjunto: não há distribuição proporcional dos 2,50 pontos nesta avaliação.

| Critério | Situação observada | O que falta para considerar concluído |
| --- | --- | --- |
| Pelo menos 80% do escopo acordado | Não comprovado | Montar a matriz do escopo completo aprovado, com critérios de aceite e evidências. T03 está ausente e T02 está parcial; T01, T04 e T07 têm falhas relevantes. |
| Processo ágil e entregas das sprints conforme TDE | Parcialmente comprovado | Relacionar backlog, entregas, PRs, revisões e testes a todas as sprints exigidas. Confirmar calendário e exigências do TDE. |
| Frontend acabado e resistente a erros | Parcial | Corrigir recuperação do chat, mensagens de erro ignoradas e inconsistências dos indicadores. Validar os fluxos nas duas contas e em dispositivo móvel. |
| Backend REST e comunicação JSON | Implementado na arquitetura atual | Manter evidências dos endpoints, respostas, validações e tratamento de erros. |
| Persistência correta dos dados relevantes | Parcial | Congelar preço acordado e conteúdo assinado; persistir observações da reserva; implementar os registros dos fluxos ainda ausentes. |
| Pelo menos dois perfis com permissões no frontend e backend | Perfis existentes, aplicação incompleta | Aplicar na API as regras de papel e autorreserva que hoje divergem da interface; testar acesso entre usuários distintos. |
| Dashboard com informações, filtros e gráficos gerenciais | Estrutura implementada, consistência pendente | Unificar o significado dos status e contadores; demonstrar filtros e gráficos com dados persistidos e valores conferidos. |
| Organização no Git e participação de todos | Boa evidência | Preservar histórico, PRs e contribuições dos quatro integrantes; vincular entregas às tarefas. |

**Não calcular o percentual de escopo apenas contando quantos códigos T01–T07 aparecem no sistema.** Uma funcionalidade pode estar parcialmente implementada. O denominador deve ser o escopo efetivamente acordado com os professores, incluindo outros requisitos se fizerem parte da entrega.

## 6. Pontuação dos opcionais

“Não contabilizado” significa falta de evidência suficiente ou exclusão conservadora desta projeção. Não significa, por exemplo, que o sistema não tenha testes ou que a cobertura medida seja zero.

| Critério da rubrica | Peso | Atendimento considerado | Pontos | Evidência ou pendência |
| --- | ---: | --- | ---: | --- |
| Modelagem de requisitos por sprint | 1,00 | Não contabilizado | 0,00 | Há backlog com critérios DADO/QUANDO/ENTÃO e especificações. Falta confirmar sua correspondência com todas as sprints avaliadas. |
| Processo de qualidade por sprint | 1,00 | Não contabilizado | 0,00 | CI, testes e revisões existem; falta comprovar a proporção de sprints em que o processo foi utilizado. |
| Prototipação no Figma e usabilidade | 1,50 | Não contabilizado | 0,00 | Há protótipos, mas não foi localizada evidência verificável de Figma, checklist aplicado e teste filmado. |
| Cobertura automatizada do backend | 1,00 | Não contabilizado | 0,00 | Sem relatório percentual de ferramenta de cobertura. |
| Documentação dos serviços backend | 1,00 | 60% | 0,60 | README e exemplos existem; completar descrição e sumário de todos os serviços, incluindo notificações, recorrência e webhook. |
| Migrações profissionais | 1,00 | 30% comprovado | 0,30 | Django migrations e histórico existem; falta mapear as migrações ao calendário das sprints. |
| SQL/ORM avançado | 1,50 | 60% | 0,90 | Constraints/índices e triggers PostgreSQL existem; falta consulta agrupada vinculada ao dashboard gerencial. |
| NoSQL avançado | 1,50 | Não contabilizado | 0,00 | O uso atual de Redis não atende ao conjunto solicitado. |
| Microsserviços | 1,50 | Não contabilizado | 0,00 | O backend é um monólito modular. Containers de infraestrutura não equivalem a microsserviços de negócio. |
| Service Discovery e API Gateway | 1,00 | Não contabilizado | 0,00 | Não implementados no contexto de microsserviços exigido pelo item. |
| Serviços cloud relevantes | 1,50 | 60% | 0,90 | Evidências de Supabase, Groq e Stripe; Firebase está integrado, mas falta comprovar uma operação completa de upload. |
| Padrões e arquitetura do backend | 1,00 | 60% | 0,60 | Camadas de serviço, adaptadores e DTOs; ainda há regras e persistência acopladas às camadas HTTP/framework. |
| Cobertura automatizada do frontend | 1,00 | Não contabilizado | 0,00 | Sem relatório percentual de ferramenta de cobertura. |
| Responsividade e customização | 1,50 | 60% | 0,90 | Temas persistidos e layouts responsivos; falta salvar personalização relevante de filtros, widgets ou colunas. |
| Internacionalização | 1,50 | Não contabilizado | 0,00 | Textos, datas e moeda permanecem fixos em português/BRL. |
| Padrões e arquitetura do frontend | 1,00 | 60% | 0,60 | Repository, Adapter, Decorator e composição/DI presentes; páginas ainda concentram regras e agregações. |
| Acessibilidade | 1,50 | 60% | 0,90 | Público e estudo de presbiopia, com estratégias implementadas; teste com participantes ainda sem resultados registrados. |
| CI/CD por ambiente | 1,50 | 30% | 0,45 | CI com build e testes; sem deploy automatizado na nuvem. |
| Infraestrutura como código | 1,00 | Não contabilizado | 0,00 | Recursos cloud criados manualmente. Ver ressalva abaixo sobre a redação do nível de 30%. |
| Monitoramento e observabilidade | 1,50 | Não contabilizado | 0,00 | Logs locais, sem métricas, dashboards operacionais e alertas integrados. Ver ressalva abaixo. |
| Modelo de imagem para CNH | 1,50 | 60% | 0,90 | Treinamento TensorFlow/MobileNetV2 e artefato integrado à API; sem múltiplos agentes de validação. |
| Pagamento sandbox completo | 1,50 | Não contabilizado | 0,00 | Checkout e webhook implementados; falta registrar um pagamento completo de teste associado a uma locação. |
| **Total conservador dos opcionais** | | | **7,05** | |

### Evidências que podem alterar essa conta

- **Pagamento:** uma demonstração completa com registro via webhook pode sustentar 60%, ou 0,90 ponto. Recorrência de reservas não equivale a agendamento de pagamentos no Stripe; não sustenta automaticamente o nível de 100%.
- **Modelagem e qualidade:** associar evidências existentes às sprints pode recuperar pontos sem criar funcionalidades. Não atribuir porcentagens antes de confirmar o total de sprints.
- **Migrações:** o nível pode subir de 30% para 60% ou 100% conforme a frequência comprovada nas sprints. Não criar migrações artificiais para pontuar.
- **Cloud:** uma quarta integração comprovada e aceita pelo professor pode elevar o item a 100%. Credencial configurada não comprova uma operação completa.
- **Arquitetura:** há base para defender uma avaliação maior, especialmente no frontend, mas é necessário demonstrar os padrões no código executado. Propostas em diretórios de backup não comprovam implementação.
- **IaC e monitoramento:** a redação literal atribui 30% à configuração manual e a logs locais/ausência de monitoramento estruturado, respectivamente. Isso acrescentaria 0,30 e 0,45 ponto, mas foi excluído da conta conservadora até alinhamento com o professor. Não descrever esses níveis como IaC ou observabilidade completos.

## 7. Plano de execução por prioridade

As etapas são uma sequência proposta, sem prazos ou responsáveis atribuídos. A equipe deve registrar responsável, sprint e PR de cada entrega no backlog. Correções de chat e organização das evidências podem avançar em paralelo às etapas de contratos e pagamentos.

### Etapa 1 — Proteger valores, contratos e permissões

**Objetivo:** remover falhas que comprometem a integridade dos fluxos existentes.

- [ ] Congelar os valores acordados da locação: tarifa, horas incluídas, taxas, moeda e total.
- [ ] Impedir que PATCH/PUT com o mesmo anúncio recalcule uma locação já paga ou assinada.
- [ ] Criar uma revisão imutável do contrato, incluindo dados das partes, anúncio e cláusulas exibidas.
- [ ] Vincular ambas as assinaturas à mesma revisão e rejeitar aceite de documento desatualizado.
- [ ] Vincular OTP ao endereço efetivamente verificado e tratar corretamente a origem dos dados de IP.
- [ ] Unificar regras de papel, autorreserva e antecedência entre API, reserva simples e recorrência.
- [ ] Rejeitar leituras negativas ou decrescentes do horímetro.

**Aceite:** alteração do anúncio ou perfil não modifica valores/documento já acordados; assinaturas de revisões diferentes não concluem o contrato; chamadas diretas à API respeitam as mesmas regras de acesso da interface. Cobrir esses casos com testes de regressão.

### Etapa 2 — Completar gestão de contratos e pagamentos (T01/T02/T04)

**Depende de:** preço e revisão de contrato protegidos; definição das regras de cancelamento, caução e alteração.

- [ ] Registrar tentativas de pagamento com identificador persistente e tratamento de repetição segura.
- [ ] Reconciliar tentativas cujo resultado externo ficou incerto após falha de rede ou gravação.
- [ ] Implementar cancelamento com checkout em andamento e com pagamento aprovado.
- [ ] Registrar pedido de estorno, processamento, sucesso ou falha sem anunciar devolução antes da confirmação.
- [ ] Liberar datas de acordo com a regra de cancelamento definida e tratar webhooks recebidos posteriormente.
- [ ] Implementar proposta de alteração, aprovação/rejeição, nova revisão e novos aceites quando necessários.
- [ ] Notificar ambas as partes e manter histórico dos eventos.

**Aceite:** testar cancelamento pendente, pago e assinado; repetição da solicitação; falha de estorno; evento duplicado ou atrasado; conflito de datas em alteração. Demonstrar o fluxo completo em sandbox e banco local, sem cobrança real.

### Etapa 3 — Implementar cobrança de horas excedentes (T03)

**Depende de:** regras de horas/franquia/tarifa aprovadas e base de pagamentos preparada.

- [ ] Criar registro de entrega e devolução com horímetro, autor, data e evidências definidas pela equipe.
- [ ] Permitir confirmação ou contestação das leituras pelas partes.
- [ ] Calcular excedente no backend usando horas incluídas e tarifa preservadas na locação.
- [ ] Criar cobrança adicional, confirmação por webhook e estados de pendência, falha e quitação.
- [ ] Separar devolução operacional de encerramento financeiro.
- [ ] Impedir conclusão quando as condições obrigatórias da locação ainda não foram cumpridas.
- [ ] Ajustar o texto do contrato para refletir o fluxo efetivamente implementado.

**Aceite:** testar uso abaixo, igual e acima da franquia; leituras inválidas; contestação; falha e repetição do pagamento; evento duplicado; tentativa de finalizar sem leitura ou quitação exigida.

### Etapa 4 — Fechar os fluxos e a consistência da interface (T01/T05/T06/T07)

- [ ] Corrigir marcação de leitura das mensagens recebidas com a conversa aberta.
- [ ] Exibir histórico além das primeiras 50 mensagens e recuperar mensagens recebidas durante desconexão.
- [ ] Evitar duplicidade quando o envio foi salvo, mas a confirmação não chegou ao navegador.
- [ ] Atualizar inbox e indicadores do dashboard após novos eventos; mostrar erros com opção de recuperação.
- [ ] Definir uma interpretação comum dos status para listas, gráficos e contadores de locação.
- [ ] Persistir observações informadas na reserva e mostrá-las às partes autorizadas.
- [ ] Incluir notificações de estorno, alteração de contrato e cobrança adicional após implementar esses eventos.
- [ ] Explicar os estados de cada ocorrência de recorrência: pendente, paga, expirada ou cancelada.

**Aceite:** teste com duas contas em sessões separadas, histórico extenso, reconexão e repetição de envio; valores do dashboard reconciliados com dados persistidos; observações preservadas após recarregar a página; notificações isoladas por destinatário e sem duplicação.

### Etapa 5 — Consolidar evidências e fechar a rubrica

- [ ] Criar matriz requisito → critério de aceite → teste/demonstração → PR → sprint → resultado.
- [ ] Confirmar com o professor o escopo total e comprovar o mínimo de 80%, incluindo outros requisitos acordados além de T01–T07.
- [ ] Relacionar as entregas do TDE e a participação dos quatro integrantes às sprints.
- [ ] Adicionar medição de cobertura ao backend e frontend e publicar relatórios na CI. Definir claramente quais módulos de aplicação entram no denominador.
- [ ] Priorizar cobertura de regras de negócio e caminhos de erro; não excluir código relevante para aumentar artificialmente o percentual.
- [ ] Completar a documentação da API com sumário, descrição, exemplos e erros relevantes por endpoint.
- [ ] Registrar um pagamento sandbox completo: reserva, Checkout, webhook, registro aprovado e atualização da interface.
- [ ] Demonstrar as integrações cloud utilizadas, sem expor chaves ou dados pessoais nas evidências.
- [ ] Organizar as evidências do modelo de CNH: origem e separação dos dados de treino/validação/teste, versão do modelo, métricas e exemplos de falsos positivos e falsos negativos. A existência do modelo treinado não comprova sua precisão nem a autenticidade de um documento.
- [ ] Localizar o Figma original, se existir, e registrar checklist de usabilidade aplicado.
- [ ] Executar o estudo com participantes do público de acessibilidade, registrar resultados e priorizar correções; obter autorização para gravações quando utilizadas.
- [ ] Salvar uma personalização útil do dashboard, como filtros por usuário, e verificar sua recuperação após novo acesso.
- [ ] Reavaliar a tabela de pontuação com as evidências aceitas pelo professor.

**Aceite:** cada item reivindicado aponta para evidência verificável, na versão demonstrada. Nenhuma pendência obrigatória permanece aberta; o percentual de escopo e a pontuação são recalculados com o método acordado.

### Etapa 6 — Preparar operação na nuvem

**Etapa futura:** AWS ou Azure ainda não foi escolhida. A escolha não precisa bloquear as correções funcionais nem a documentação da entrega.

- [ ] Escolher hospedagem do frontend, backend ASGI/WebSocket, Redis e armazenamento.
- [ ] Criar artefatos de produção, com frontend compilado, configurações de produção e imagens identificadas pelo commit.
- [ ] Separar staging e produção, com credenciais e bancos distintos; adicionar deploy automatizado e promoção controlada.
- [ ] Planejar migrations, backup, recuperação e rollback. Reverter a imagem não reverte automaticamente alterações do banco.
- [ ] Introduzir provisionamento cloud versionado e integrado ao deploy quando a arquitetura escolhida justificar.
- [ ] Adicionar métricas, logs centralizados, alertas e testes de recuperação.
- [ ] Revisar dependências e resultados de auditoria antes de expor a aplicação publicamente.

**Aceite:** demonstrar publicação em staging, verificação de saúde, teste dos fluxos essenciais, promoção da mesma versão e recuperação de uma falha simulada.

Preservar a convenção atual: `develop` e `acceptance` usam banco local por padrão; `main` usa Supabase pelo helper. **Isso seleciona o banco na execução local, não realiza deploy.** A CI deve continuar usando banco local descartável, inclusive ao testar `main`. O planejamento de ambientes remotos está em [CI_CD.md](../Devops/CI_CD.md).

## 8. Decisões de negócio a registrar antes das funcionalidades ausentes

| Decisão | Impacto |
| --- | --- |
| “Caução” é garantia reembolsável, pagamento mínimo antecipado ou pagamento integral? | Valor cobrado, saldo, cancelamento, estorno e cláusulas do contrato. |
| Quais estados permitem cancelamento, por quem e com quais taxas? | Permissões, estorno, liberação de datas e notificações. |
| Como funcionam alterações de contrato pendente? | Consentimento, nova cotação, conflito de agenda e revisão do documento. |
| Quantas horas estão incluídas e como arredondar/cobrar o excedente? | Cálculo do T03 e consistência entre interface, banco e contrato. |
| Quem registra e confirma o horímetro? Quais evidências são obrigatórias? | Entrega, devolução, contestação e encerramento. |
| Qual antecedência é exigida e quais perfis podem reservar? | Consistência entre API, reserva comum e recorrência. |
| Como tratar pagamento e expiração de cada reserva recorrente? | Disponibilidade, explicação ao usuário e recuperação de ocorrências. |

As decisões ainda não confirmadas são dependências do plano, não regras já adotadas. As correções de integridade da etapa 1 podem avançar enquanto a equipe define essas políticas.

## 9. Estratégia de validação e evidências

Na versão analisada, a auditoria registrou CI aprovada com **378 testes Django**, **101 testes frontend**, **102 execuções Playwright** — 34 cenários em três navegadores — e **19 testes dos helpers**. Isso não comprova cobertura percentual, atendimento dos requisitos ausentes nem execução real dos serviços externos.

A mesma auditoria executou 15 verificações dirigidas que reproduziram defeitos. Elas documentam os problemas e precisam ser transformadas em testes de regressão que exijam o comportamento correto durante as correções.

| Camada | Verificação proposta | Evidência a guardar |
| --- | --- | --- |
| Regras de negócio | Preços imutáveis, revisão assinada, permissões, horas, estorno e transições | Testes e resultados vinculados ao commit |
| API e banco | Concorrência, rollback, isolamento entre usuários, migrations e duplicidade de eventos | Relatórios de integração em PostgreSQL local |
| Interface | Fluxos das duas partes, estados vazios, erro/retry, atualização e mobile | Relatório Playwright e demonstração dos cenários |
| Provedores | Pagamento sandbox, upload e demais integrações reivindicadas | Evidência de operação completa, com dados sensíveis ocultados |
| Cobertura | Percentual medido sobre código relevante e escopo explícito | Relatório de ferramenta publicado na CI |
| Processo | Requisito, sprint, responsável, PR, revisão e aceite | Matriz rastreável de entregas e evidências |

Executar testes automatizados e cenários destrutivos em banco local descartável. Para Stripe, seguir o [guia de sandbox](../Devops/STRIPE.md) e confirmar o checkout/ambiente em uso. Não considerar página de sucesso ou webhook de uma sessão sem locação como prova de pagamento completo da aplicação.

## 10. Critério de conclusão do plano

- [ ] Todos os obrigatórios aprovados com evidências.
- [ ] Escopo mínimo demonstrado sobre o conjunto acordado, sem contabilizar funcionalidades parciais como completas.
- [ ] Nenhuma falha crítica conhecida de preço, documento assinado ou permissões permanece aberta.
- [ ] Fluxos entregues de contrato, pagamento e cobrança adicional demonstrados conforme as regras aprovadas.
- [ ] Suíte de regressão aprovada no commit da entrega, com relatórios de cobertura.
- [ ] Evidências de sprints, participação, acessibilidade e integrações organizadas.
- [ ] Pontuação revisada com o professor; critérios ainda não entregues identificados claramente.

A prioridade é concluir e comprovar os fluxos essenciais. Microsserviços, NoSQL, internacionalização e outras tecnologias opcionais devem entrar apenas quando fizerem sentido para o produto e o prazo, sem substituir o fechamento das pendências obrigatórias.

## 11. Referências do projeto

- [Auditoria T01–T07](FEATURE_AUDIT_T01_T07.md): defeitos reproduzidos, critérios de aceite e locais de implementação.
- [PR da versão integrada](https://github.com/joaoson/Frota_Rural/pull/44) e [CI da revisão analisada](https://github.com/joaoson/Frota_Rural/actions/runs/38520219713).
- [Backlog](../Devops/Frota_Rural_Backlog.xlsx): requisitos e critérios de aceite a reconciliar com as sprints avaliadas.
- [Migrações](README_Database_Migrations.md) e [integrações verificadas](README_Merge_Readiness.md).
- [Estudo de acessibilidade](acessbilidade_presbiopia.md): público, estratégias e protocolo de avaliação.
- [Notificações](README_Notificacoes_Locacao.md), [recorrência](README_Recorrencia_Aluguel.md) e [chat](README_Chat_Funcionamento.md).
- [Sugestão de preço por IA](README_Sugestao_Preco_Hora.md), [Firebase Storage](README_Firebase_Storage.md) e [fluxo de assinatura](README_Fluxo_Assinatura.md).
- [CI e deploy futuro](../Devops/CI_CD.md), [ambiente de desenvolvimento](../Devops/DEVELOPMENT.md), [comandos rápidos](../Devops/QUICK_START.md) e [Stripe sandbox](../Devops/STRIPE.md).

Atualizar a data, revisão, pontuação e evidências deste documento após cada etapa. Uma tarefa só deve ser marcada como concluída depois de implementada e validada.
