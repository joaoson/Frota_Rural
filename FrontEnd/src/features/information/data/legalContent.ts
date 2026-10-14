export interface InformationSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
}

// Product rules and data handling must stay aligned with the implemented flows.
// Do not add company details, retention periods or refund promises without an approved policy.
export const termsSections: InformationSection[] = [
  {
    id: "plataforma", title: "O que a Frota Rural oferece",
    paragraphs: ["A Frota Rural conecta quem precisa de maquinário agrícola a quem tem equipamentos para alugar. Você pode consultar anúncios, solicitar reservas, acompanhar pagamentos, conversar com a outra parte e consultar o contrato de cada locação.", "As informações do anúncio e as condições do contrato ajudam a definir o combinado entre locador e locatário. Leia esses detalhes antes de reservar ou assinar."],
  },
  {
    id: "conta", title: "Sua conta e suas informações",
    paragraphs: ["Mantenha seus dados de cadastro e contato atualizados. Use informações verdadeiras e envie apenas documentos que você tenha autorização para apresentar. Sua senha e os códigos de confirmação são pessoais: não os compartilhe.", "As ações disponíveis dependem do seu perfil. Locadores administram equipamentos e anúncios; locatários organizam reservas e sua equipe de operadores. Operadores acompanham as atividades às quais estão vinculados."],
  },
  {
    id: "anuncios", title: "Anúncios e uso dos equipamentos",
    paragraphs: ["Quem anuncia deve descrever corretamente o equipamento, seu estado, localização, disponibilidade e preço. Quem aluga deve conferir a adequação da máquina ao trabalho e combinar com o locador os detalhes de entrega, retirada e operação.", "Confirme as habilitações e certificações necessárias para a atividade. Um cadastro ou documento enviado à plataforma não substitui a avaliação das condições de segurança para o uso do equipamento."],
  },
  {
    id: "reservas", title: "Reservas, valores e recorrência",
    paragraphs: ["Revise as datas, os horários e o valor total apresentado antes de confirmar uma reserva. A disponibilidade pode mudar entre uma consulta e a confirmação. Reservas pendentes também podem expirar; acompanhe o prazo e o status no painel.", "Ao programar uma recorrência, você reutiliza informações de uma locação anterior para criar novas reservas. As novas datas são verificadas e os preços são recalculados. Cada reserva tem seu próprio pagamento e contrato.", "Sugestões de preço com inteligência artificial são referências para o anúncio. Quando houver estimativas, confira as fontes e premissas apresentadas; a sugestão não garante um valor de mercado ou rendimento."],
  },
  {
    id: "pagamentos", title: "Pagamentos, contratos e cancelamento",
    paragraphs: ["O pagamento é iniciado pelo botão disponível na reserva e processado no ambiente de checkout. Voltar do checkout não significa, por si só, que o pagamento foi confirmado: confira o status na plataforma.", "Leia o contrato completo antes de aceitar seus termos e confirmar a assinatura. Não envie seu código de confirmação para outra pessoa. As etapas e pendências da assinatura ficam disponíveis na locação.", "Use a opção de cancelamento quando ela estiver disponível. Cancelar uma reserva e receber um reembolso são processos diferentes; não presuma que um cancelamento gera estorno automático. Consulte as condições da locação e esclareça a situação antes de efetuar outro pagamento."],
  },
  {
    id: "convivencia", title: "Convivência e comunicação",
    paragraphs: ["Use o chat para tratar da locação com respeito e mantenha informações relevantes registradas. Não publique conteúdo fraudulento, ofensivo ou dados pessoais de terceiros sem autorização.", "As avaliações devem refletir uma experiência real de locação. Anúncios, documentos e contas podem passar por análise de moderação. Consulte a Central de ajuda para entender as etapas da plataforma e resolver dúvidas de uso."],
  },
];

export const privacySections: InformationSection[] = [
  {
    id: "dados", title: "Quais dados fazem parte da sua conta",
    paragraphs: ["O cadastro reúne dados de identificação e contato para organizar as locações. Dependendo das funcionalidades utilizadas, também são registrados documentos, equipamentos e atividades na plataforma."],
    items: ["Nome, e-mail, CPF ou CNPJ, data de nascimento, telefone e endereço informados no cadastro.", "Dados de equipamentos, anúncios, fotos, datas de reserva, valores e vínculo com operadores.", "CNH e certificações enviadas para as funcionalidades que exigem documentação.", "Mensagens, avaliações, notificações e registros de pagamento e assinatura, incluindo data, IP e informações do navegador associados à assinatura."],
  },
  {
    id: "finalidades", title: "Como essas informações são usadas",
    paragraphs: ["Os dados permitem autenticar sua conta, apresentar anúncios, verificar disponibilidade, organizar sua equipe, elaborar contratos e acompanhar a locação. Informações de contato também são usadas em fluxos como recuperação de senha e envio de códigos de assinatura.", "Documentos e registros da operação dão suporte à análise de cadastro, à moderação e à verificação das etapas de uma locação. A sugestão de preço usa as características do equipamento fornecidas no formulário, como marca, modelo, ano e uso."],
  },
  {
    id: "compartilhamento", title: "Quem participa do tratamento dos dados",
    paragraphs: ["Anúncios e informações públicas de avaliação podem ser consultados na plataforma. Dados necessários à locação aparecem para as partes envolvidas e no contrato. Recursos de administração e análise de documentos têm acesso restrito por perfil.", "A plataforma utiliza serviços de hospedagem, banco de dados, armazenamento de arquivos, envio de e-mails, mapas e pesquisa de preços. Esses serviços recebem as informações necessárias às funções que executam. Consultas de CEP e localização também usam serviços externos.", "O checkout é processado pela Stripe. Dados de cartão são informados no ambiente de pagamento; a Frota Rural acompanha identificadores, valores e status da transação."],
  },
  {
    id: "navegador", title: "Cookies e preferências do navegador",
    paragraphs: ["O login utiliza um cookie de autenticação para renovar o acesso à conta. O navegador também guarda sua preferência de aparência, como tema claro ou escuro. Esses recursos ajudam a manter sua sessão e a experiência escolhida.", "Você pode sair da conta e limpar os dados do site nas configurações do navegador. Bloquear cookies pode impedir a manutenção do login. A preferência de tema pode ser alterada pelo botão no topo da página."],
  },
  {
    id: "escolhas", title: "Suas informações e suas escolhas",
    paragraphs: ["Você pode consultar e corrigir os dados disponíveis na seção Conta do seu painel, além de alterar a senha. Evite incluir senhas, códigos de assinatura ou documentos pessoais no chat de uma locação.", "A legislação de proteção de dados prevê direitos como confirmação do tratamento, acesso e correção de dados. Solicitações de eliminação e outros direitos dependem das condições previstas em lei. Consulte a orientação oficial da ANPD para conhecer esses direitos.", "Sair da conta ou limpar os dados do navegador não exclui o cadastro, os contratos ou o histórico de locações. Não há exclusão automática da conta por esses comandos."],
  },
];
