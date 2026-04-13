export const passwordPattern = {
  regex: /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/,
  title:
    "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número",
} as const;
