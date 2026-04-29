export const PasswordResetError = {
  PasswordResetTokenInvalid:
    "Token inválido ou expirado. Solicite um novo link.",
  PasswordResetServerError:
    "Erro ao redefinir senha. Tente novamente mais tarde.",
} as const;

export type PasswordResetError =
  (typeof PasswordResetError)[keyof typeof PasswordResetError];

export class PasswordResetServiceError extends Error {
  constructor(message: PasswordResetError) {
    super(message);
  }
}
