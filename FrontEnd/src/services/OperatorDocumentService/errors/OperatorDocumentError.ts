export const OperatorDocumentError = {
  InvalidData: "Dados inválidos. Verifique os campos e tente novamente.",
  NotFound: "Documento não encontrado.",
  ServerError: "Erro no servidor. Tente novamente mais tarde.",
} as const;

export type OperatorDocumentError =
  (typeof OperatorDocumentError)[keyof typeof OperatorDocumentError];

export class OperatorDocumentServiceError extends Error {
  constructor(message: OperatorDocumentError) {
    super(message);
  }
}
