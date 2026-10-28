export const helpCategories = [
  { id: "rentals", label: "Reservas e recorrência" },
  { id: "payments", label: "Pagamento e contrato" },
  { id: "fleet", label: "Minha frota" },
  { id: "account", label: "Conta e documentos" },
  { id: "notifications", label: "Notificações" },
] as const;

export type HelpCategory = typeof helpCategories[number]["id"];

interface HelpTopic {
  id: string;
  category: HelpCategory;
  question: string;
  answer: string[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: "find-and-book",
    category: "rentals",
    question: "Como encontro e reservo uma máquina?",
    answer: [
      "Acesse Buscar Máquinas, use os filtros e abra um anúncio para conferir o equipamento, o local e o valor por hora. Entre na sua conta de locatário para informar as datas e seguir com a reserva.",
      "Revise o período e o total antes de avançar para o pagamento. A disponibilidade é conferida novamente ao reservar; se as datas já estiverem ocupadas, escolha outro período ou equipamento.",
    ],
  },
  {
    id: "rental-recurrence",
    category: "rentals",
    question: "Como programo uma recorrência de aluguel?",
    answer: [
      "Em Minhas Locações, use Programar recorrência em uma locação elegível. Informe a primeira data futura, a frequência semanal, quinzenal ou mensal e a quantidade de novas reservas, de 2 a 12.",
      "A recorrência reutiliza o maquinário, a duração e o operador vinculado à locação original, quando houver. Consulte a prévia para conferir as datas, a disponibilidade e os preços atuais antes de criar. A locação original permanece como está.",
      "Cada nova reserva tem seu próprio pagamento. Programar a recorrência não realiza cobranças automáticas. Confira o prazo de pagamento exibido para cada reserva.",
    ],
  },
  {
    id: "recurrence-availability",
    category: "rentals",
    question: "Por que não consigo confirmar uma recorrência?",
    answer: [
      "Todas as novas datas precisam estar disponíveis. Se houver conflito com outra reserva, ajuste o início, a frequência ou a quantidade e consulte a prévia novamente. Nos meses sem o dia escolhido, a opção mensal usa o último dia do mês.",
      "O anúncio e o equipamento também precisam estar disponíveis. Se a locação original tiver operador, ele deve continuar ativo e vinculado à sua equipe para ser usado nas novas reservas.",
    ],
  },
  {
    id: "cancel-rental",
    category: "rentals",
    question: "Onde acompanho ou cancelo uma reserva?",
    answer: [
      "No painel, abra Minhas Locações e confira a situação da reserva. As ações disponíveis mudam conforme o andamento da locação e o seu perfil.",
      "Quando Cancelar reserva estiver disponível, leia a confirmação antes de concluir. O cancelamento libera as datas; não considere um pagamento estornado apenas porque a reserva foi cancelada. Confira a situação do pagamento e as condições do contrato.",
    ],
  },
  {
    id: "checkout",
    category: "payments",
    question: "Como funciona o pagamento da reserva?",
    answer: [
      "Depois de revisar os dados da reserva, avance para o pagamento. A plataforma abre o checkout da Stripe e, ao retornar, consulta a confirmação antes de liberar a próxima etapa.",
      "Se você interromper o checkout, retome o pagamento pela mesma reserva, enquanto ela estiver disponível. Reservas provisórias têm um prazo para pagamento, informado na tela; após a expiração, as datas podem ser liberadas.",
    ],
  },
  {
    id: "payment-pending",
    category: "payments",
    question: "Paguei, mas a confirmação ainda não apareceu. O que faço?",
    answer: [
      "Consulte a situação da reserva em Minhas Locações e as notificações da sua conta. O retorno do checkout pode ocorrer antes da confirmação do pagamento chegar à plataforma.",
      "Se a tela informar Pagamento em análise, acompanhe essa mesma reserva. Não faça outro pagamento apenas para tentar liberar o contrato, nem compartilhe dados de cartão, senhas ou códigos de acesso.",
    ],
  },
  {
    id: "contract-signature",
    category: "payments",
    question: "Onde consulto e assino o contrato?",
    answer: [
      "Após a confirmação do pagamento, consulte o contrato na reserva ou na seção Contratos do painel. Quando Assinar Contrato estiver disponível para você, confira os dados e os termos antes de continuar.",
      "A assinatura solicita seu nome, o aceite dos termos e a verificação pelo código enviado ao e-mail cadastrado. Se o código não chegar, confira a caixa de spam e se você tem acesso a esse endereço. Use a opção de reenvio quando estiver disponível.",
      "Cada parte acompanha sua própria assinatura. Você pode voltar ao contrato para consultar o documento e a situação das assinaturas.",
    ],
  },
  {
    id: "publish-listing",
    category: "fleet",
    question: "Como anuncio meu equipamento?",
    answer: [
      "Entre com seu perfil de locador e cadastre o equipamento no painel, informando os dados da máquina. Depois, crie o anúncio vinculado a esse equipamento, com fotos, descrição, localização e preço por hora.",
      "Confira os campos obrigatórios e a situação do anúncio no painel. Um anúncio indisponível ou bloqueado não pode receber novas reservas. Se ele estiver em moderação, você pode corrigir os dados, mas a publicação depende da análise da plataforma.",
    ],
  },
  {
    id: "pricing-suggestion",
    category: "fleet",
    question: "A sugestão de preço é o valor final do meu anúncio?",
    answer: [
      "A sugestão ajuda a avaliar um preço por hora com base nos dados do equipamento. Confira a marca, o modelo e o ano antes de solicitar o cálculo.",
      "Quando houver uma estimativa, a tela identifica suas premissas. Revise o resultado conforme as condições da sua máquina e da operação: o preço do anúncio é o valor que você confirma ao salvar.",
    ],
  },
  {
    id: "account-documents",
    category: "account",
    question: "Como atualizo meus dados e envio documentos?",
    answer: [
      "Abra Minha Conta no painel para revisar e salvar seus dados cadastrais. Locadores encontram os envios de CNH e certificações na seção Documentos; operadores acessam Meus documentos dentro de Minha Conta.",
      "Confira os formatos e limites informados em cada tela e envie arquivos legíveis. O envio não significa aprovação imediata: acompanhe a situação do documento no painel.",
    ],
  },
  {
    id: "forgot-password",
    category: "account",
    question: "Esqueci minha senha. Como recupero o acesso?",
    answer: [
      "Na tela de entrada, selecione Esqueci minha senha e informe o e-mail da sua conta. Siga as orientações recebidas para definir uma nova senha e confira a caixa de spam se a mensagem não aparecer.",
      "Não compartilhe o link de recuperação nem códigos de verificação. Se o link não puder mais ser usado, solicite a recuperação novamente.",
    ],
  },
  {
    id: "notifications",
    category: "notifications",
    question: "Onde vejo as atualizações de locação, pagamento e contrato?",
    answer: [
      "Use o sino de notificações ou a seção Notificações no painel. Ali você acompanha as atualizações relacionadas à sua conta e pode abrir a locação ou o contrato quando houver um link disponível.",
      "Filtre por tipo ou por notificações não lidas para encontrar o que precisa. Marcar como lida ou dispensar uma notificação organiza sua lista; essas ações não alteram a locação, o pagamento ou o contrato.",
    ],
  },
];
