export const ChatError = {
  Forbidden: "Você não participa desta conversa.",
  CannotWrite: "Você não pode enviar mensagens nesta conversa.",
  NotFound: "Conversa não encontrada.",
  AlreadyReported: "Você já denunciou esta mensagem.",
  RateLimited: "Muitas mensagens em pouco tempo. Aguarde alguns segundos.",
  ServerError: "Erro no servidor. Tente novamente mais tarde.",
} as const;

export type ChatError = (typeof ChatError)[keyof typeof ChatError];

export class ChatServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatServiceError";
  }
}
