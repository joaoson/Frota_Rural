import type { CreateOperatorRequest } from "./CreateOperatorRequest";

/** A senha não é editável por aqui: o operador a troca na própria conta. */
export type UpdateOperatorRequest = Partial<
  Omit<CreateOperatorRequest, "password">
>;
