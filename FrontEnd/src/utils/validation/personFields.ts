import { mensagemErroDocumento } from "./validateDocument";
import { mensagemErroCEP } from "./validateCEP";
import { passwordPattern } from "@/utils/regexPatterns";

/**
 * Validação dos campos de cadastro de pessoa, compartilhada entre o cadastro
 * público (/signup) e o cadastro de operadores feito de dentro do painel.
 * Os dois formulários pedem exatamente os mesmos dados; manter duas cópias das
 * regras só garantiria que uma delas ficasse para trás.
 */
export type PersonField =
  | "name"
  | "birthDate"
  | "document"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "uf"
  | "cep"
  | "password";

/** Data de nascimento mais recente aceita: a plataforma exige 18 anos. */
export function maxBirthDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split("T")[0];
}

/** Retorna a mensagem de erro do campo, ou "" quando o valor é válido. */
export function validatePersonField(field: PersonField, value: string): string {
  switch (field) {
    case "name": {
      const trimmed = value.trim();
      if (!trimmed) return "Nome é obrigatório.";
      if (trimmed.length < 3) return "Nome deve ter no mínimo 3 caracteres.";
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(trimmed)) return "Nome deve conter apenas letras.";
      return "";
    }
    case "birthDate": {
      if (!value) return "Data de nascimento é obrigatória.";
      if (value > maxBirthDate()) return "É necessário ter 18 anos ou mais para se cadastrar.";
      if (value < "1900-01-01") return "Data inválida.";
      return "";
    }
    case "document":
      return mensagemErroDocumento(value);
    case "email": {
      const trimmed = value.trim();
      if (!trimmed) return "E-mail é obrigatório.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "E-mail inválido.";
      return "";
    }
    case "phone": {
      const digits = value.replace(/\D/g, "");
      if (!digits) return "Telefone é obrigatório.";
      if (digits.length !== 10 && digits.length !== 11) return "Telefone deve ter 10 ou 11 dígitos.";
      return "";
    }
    case "address": {
      if (!value.trim()) return "Endereço é obrigatório.";
      if (value.trim().length < 5) return "Endereço deve ter pelo menos 5 caracteres.";
      return "";
    }
    case "city": {
      if (!value.trim()) return "Cidade é obrigatória.";
      if (value.trim().length < 2) return "Cidade deve ter pelo menos 2 caracteres.";
      return "";
    }
    case "uf":
      return value ? "" : "Selecione o estado.";
    case "cep":
      return mensagemErroCEP(value, true);
    case "password": {
      if (!value) return "Senha é obrigatória.";
      if (!passwordPattern.regex.test(value)) return passwordPattern.title;
      return "";
    }
  }
}
