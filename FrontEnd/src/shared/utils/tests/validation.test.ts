import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { maxBirthDate, validatePersonField, type PersonField } from "../validation/personFields";
import { mensagemErroCEP } from "../validation/validateCEP";
import { validateCNPJ } from "../validation/validateCNPJ";
import { mensagemErroDocumento, validateDocument } from "../validation/validateDocument";
import { validateRG } from "../validation/validateRG";

const VALID_CPF = "529.982.247-25";
const VALID_CNPJ = "11.222.333/0001-81";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

it.each([
  [VALID_CPF, true], ["529.982.247-24", false], ["111.111.111-11", false],
  [VALID_CNPJ, true], ["11.222.333/0001-80", false], ["00.000.000/0000-00", false],
  ["1234", false],
])("validates the CPF/CNPJ check digits of %s", (value, expected) => {
  expect(validateDocument(value)).toBe(expected);
});

it("rejects a CNPJ whose second check digit is wrong even when the first one matches", () => {
  expect(validateCNPJ("11222333000182")).toBe(false);
});

it.each([
  ["", true, "Documento é obrigatório."],
  ["", false, ""],
  ["123", true, "Documento inválido. Informe CPF (11 dígitos) ou CNPJ (14 dígitos)."],
  ["529.982.247-24", true, "CPF inválido. Verifique os dígitos informados."],
  ["11.222.333/0001-80", true, "CNPJ inválido. Verifique os dígitos informados."],
  [VALID_CNPJ, true, ""],
])("explains why the document %j is rejected (required=%s)", (value, required, message) => {
  expect(mensagemErroDocumento(value, required)).toBe(message);
});

it.each([
  ["", false, ""], ["", true, "CEP é obrigatório."],
  ["75900-00", false, "CEP deve ter exatamente 8 dígitos."], ["75900-000", true, ""],
])("only requires the CEP where the form demands it (%j, required=%s)", (value, required, message) => {
  expect(mensagemErroCEP(value, required)).toBe(message);
});

it.each([["123456789", true], ["1234567", true], ["123456", false], ["1234567890", false], ["111111111", false]])(
  "accepts RG %s only with 7 to 9 non-repeated digits", (digits, expected) => {
    expect(validateRG(digits)).toBe(expected);
  },
);

it("requires the person registering to be at least 18 years old", () => {
  expect(maxBirthDate()).toBe("2008-10-21");
  expect(validatePersonField("birthDate", "2008-10-22")).toBe("É necessário ter 18 anos ou mais para se cadastrar.");
  expect(validatePersonField("birthDate", "2008-10-21")).toBe("");
});

it.each<[PersonField, string, string]>([
  ["name", " ", "Nome é obrigatório."],
  ["name", "Al", "Nome deve ter no mínimo 3 caracteres."],
  ["name", "Ana 2", "Nome deve conter apenas letras."],
  ["name", "Ana Lúcia", ""],
  ["birthDate", "", "Data de nascimento é obrigatória."],
  ["birthDate", "1899-12-31", "Data inválida."],
  ["document", "", "Documento é obrigatório."],
  ["document", VALID_CPF, ""],
  ["email", "", "E-mail é obrigatório."],
  ["email", "maria@", "E-mail inválido."],
  ["email", " maria@example.com ", ""],
  ["phone", "", "Telefone é obrigatório."],
  ["phone", "(64) 9999", "Telefone deve ter 10 ou 11 dígitos."],
  ["phone", "(64) 99999-0000", ""],
  ["address", "", "Endereço é obrigatório."],
  ["address", "Rua", "Endereço deve ter pelo menos 5 caracteres."],
  ["address", "Rua A, 10", ""],
  ["city", "", "Cidade é obrigatória."],
  ["city", "X", "Cidade deve ter pelo menos 2 caracteres."],
  ["city", "Rio Verde", ""],
  ["uf", "", "Selecione o estado."],
  ["uf", "GO", ""],
  ["cep", "", "CEP é obrigatório."],
  ["password", "", "Senha é obrigatória."],
  ["password", "fraca123", "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número"],
  ["password", "Forte1234", ""],
])("validates the shared person field %s = %j", (field, value, message) => {
  expect(validatePersonField(field, value)).toBe(message);
});
