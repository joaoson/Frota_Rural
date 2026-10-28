import { screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Help from "@/pages/public/Help";
import Privacy from "@/pages/public/Privacy";
import Terms from "@/pages/public/Terms";
import { termsSections } from "../data/legalContent";
import { helpTopics } from "../data/helpTopics";
import { renderWithProviders } from "@/test/render";

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const scrollTo = vi.fn();
beforeEach(() => { scrollTo.mockReset(); window.scrollTo = scrollTo; });

it("searches help topics ignoring accents and case", async () => {
  const { user } = renderWithProviders(<Help />, { route: "/help" });
  expect(screen.getByRole("status")).toHaveTextContent(`${helpTopics.length} perguntas encontradas`);
  await user.type(screen.getByLabelText("Buscar na central de ajuda"), "RECORRENCIA");
  expect(screen.getByRole("status")).toHaveTextContent(/perguntas? encontradas?/);
  expect(screen.getByText("Como programo uma recorrência de aluguel?")).toBeInTheDocument();
  expect(screen.queryByText("Esqueci minha senha. Como recupero o acesso?")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Limpar busca" }));
  expect(screen.getByLabelText("Buscar na central de ajuda")).toHaveValue("");
});

it("filters by subject and recovers from a search without results", async () => {
  const { user } = renderWithProviders(<Help />, { route: "/help" });
  const subjects = screen.getByRole("group", { name: "Filtrar perguntas por assunto" });
  await user.click(within(subjects).getByRole("button", { name: "Conta e documentos" }));
  expect(within(subjects).getByRole("button", { name: "Conta e documentos" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Esqueci minha senha. Como recupero o acesso?")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Buscar na central de ajuda"), "senha");
  expect(screen.getByRole("status")).toHaveTextContent("1 pergunta encontrada");
  await user.type(screen.getByLabelText("Buscar na central de ajuda"), " xyzabc");
  expect(screen.getByRole("heading", { name: "Não encontramos essa trilha por aqui." })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Ver todas as perguntas" }));
  expect(screen.getByRole("status")).toHaveTextContent(`${helpTopics.length} perguntas encontradas`);
  await user.click(within(subjects).getByRole("button", { name: "Notificações" }));
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(within(subjects).getByRole("button", { name: "Todos os assuntos" })).toHaveAttribute("aria-pressed", "true");
  screen.getByRole("search").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

it("shows the terms with a table of contents and marks the current page", () => {
  renderWithProviders(<Terms />, { route: "/termos-de-uso" });
  expect(screen.getByRole("heading", { level: 1, name: "Termos de uso" })).toBeInTheDocument();
  const toc = screen.getByRole("navigation", { name: "Nesta página" });
  expect(within(toc).getAllByRole("link")).toHaveLength(termsSections.length);
  expect(within(screen.getByRole("navigation", { name: "Informações da plataforma" })).getByRole("link", { name: /Termos de uso/ })).toHaveAttribute("aria-current", "page");
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
});

it("jumps to the section named in the URL hash", () => {
  const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
  renderWithProviders(<Privacy />, { route: `/privacidade#${termsSections[0].id}`, path: "/privacidade" });
  expect(screen.getByRole("link", { name: /ANPD/ })).toHaveAttribute("target", "_blank");
  renderWithProviders(<Terms />, { route: `/termos-de-uso#${termsSections[0].id}`, path: "/termos-de-uso" });
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
});
