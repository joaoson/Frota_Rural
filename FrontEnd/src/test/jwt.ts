/** JWT sem assinatura, suficiente para o front decodificar papel e expiração. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}
