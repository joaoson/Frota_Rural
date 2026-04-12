export const UserError = {
  InvalidCredentials: "Credenciais inválidas. Tente novamente.",
  UserNotFound:
    "Não foi encontrado um usuário com essas credenciais. Tente novamente.",
  ServerError: "Erro no servidor. Tente novamente mais tarde.",
} as const;

export type UserError = (typeof UserError)[keyof typeof UserError];

export class UserServiceError extends Error {
  constructor(message: UserError) {
    super(message);
  }
}
