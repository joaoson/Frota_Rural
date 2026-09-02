export type CreateOperatorRequest = {
  name: string;
  birth_date: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  /** Senha inicial, definida por quem cadastra e repassada ao operador. */
  password: string;
};
