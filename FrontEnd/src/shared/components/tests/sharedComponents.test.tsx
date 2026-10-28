import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Capybara from "../Capybara";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { FormField } from "../FormField";
import { GradientButton } from "../GradientButton";
import { FullPageLoading, LoadingState } from "../LoadingState";
import { PageHeader } from "../PageHeader";
import { StarRating } from "../StarRating";


it.each([
  ["spinner", "Carregando frota", "py-32"],
  ["text", undefined, "py-20"],
  ["inline", "Salvando", "gap-2"],
] as const)("shows a %s loading indicator", (variant, label, layout) => {
  const { container } = render(<LoadingState variant={variant} label={label} className="extra" />);
  expect(container.firstChild).toHaveClass(layout, "extra");
  expect(container).toHaveTextContent(label ?? "Carregando...");
});

it("shows unlabeled spinners and the full-page loader", () => {
  const { container } = render(<><LoadingState /><LoadingState variant="inline" /><FullPageLoading /></>);
  expect(container.querySelectorAll(".animate-spin")).toHaveLength(3);
  expect(screen.getByText("Carregando...")).toBeInTheDocument();
});

it("renders empty states as a card or bare, with optional description and action", () => {
  const { rerender, container } = render(<EmptyState icon="inbox" title="Nada por aqui" description="Cadastre sua primeira máquina." action={<button>Cadastrar</button>} className="mt-4" />);
  expect(screen.getByRole("heading", { name: "Nada por aqui" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
  expect(container.firstChild).toHaveClass("rounded-2xl", "mt-4");
  rerender(<EmptyState icon="inbox" title="Nada" variant="bare" />);
  expect(container.firstChild).not.toHaveClass("rounded-2xl");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<EmptyState icon="inbox" title="Nada" variant="bare" className="p-2" />);
  expect(container.firstChild).toHaveClass("p-2");
});

it("renders error states with a default title", () => {
  const { rerender } = render(<ErrorState message="Servidor fora do ar." className="mb-2" />);
  expect(screen.getByText("Erro ao carregar")).toBeInTheDocument();
  expect(screen.getByText("Servidor fora do ar.")).toBeInTheDocument();
  rerender(<ErrorState title="Falhou" />);
  expect(screen.getByText("Falhou")).toBeInTheDocument();
});

it.each([
  [{ align: "center", icon: "lock", subtitle: "Entre" }, "mx-auto"],
  [{ compact: true, subtitle: "Resumo" }, "mt-2"],
  [{}, "mb-3"],
] as const)("lays out page headers (%j)", (props, dividerClass) => {
  const { container } = render(<PageHeader title="Painel" {...props} />);
  expect(screen.getByRole("heading", { name: "Painel" })).toBeInTheDocument();
  expect(container.querySelector(".h-1")).toHaveClass(dividerClass);
});

it("places a header action beside the title", () => {
  render(<PageHeader title="Frota" action={<button>Nova máquina</button>} className="mb-6" />);
  expect(screen.getByRole("button", { name: "Nova máquina" }).parentElement).toHaveClass("flex", "mb-6");
});

it("shows a pending label and blocks repeated submissions", () => {
  const { rerender } = render(<GradientButton icon="send" pending pendingLabel="Enviando...">Enviar</GradientButton>);
  expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled();
  rerender(<GradientButton size="sm" fullWidth={false} className="mt-2">Enviar</GradientButton>);
  expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  expect(screen.getByRole("button")).not.toHaveClass("w-full");
  rerender(<GradientButton responsive disabled>Enviar</GradientButton>);
  expect(screen.getByRole("button")).toBeDisabled();
});

it("lets the user pick a star rating and shows read-only ratings", async () => {
  const onChange = vi.fn();
  const { container, rerender } = render(<StarRating value={2} onChange={onChange} />);
  await userEvent.click(container.querySelectorAll("span")[3]);
  expect(onChange).toHaveBeenCalledWith(4);
  rerender(<StarRating value={3} max={4} className="gap-1" />);
  const stars = container.querySelectorAll("span");
  expect(stars).toHaveLength(4);
  expect(stars[2]).toHaveClass("text-secondary-container");
  expect(stars[3]).toHaveClass("text-outline/30");
});

it("links labels to their controls and reports errors and hints", () => {
  const { rerender } = render(<FormField label="E-mail" error="E-mail inválido." icon={<i>@</i>}><input /></FormField>);
  expect(screen.getByLabelText(/E-mail/)).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
  rerender(<FormField label="Telefone" hint="Com DDD"><input id="phone" /></FormField>);
  expect(screen.getByLabelText("Telefone")).toHaveAttribute("id", "phone");
  expect(screen.getByText("Com DDD")).toBeInTheDocument();
  rerender(<FormField label="Arquivo" htmlFor="upload"><div><input id="upload" /></div></FormField>);
  expect(screen.getByLabelText("Arquivo")).toHaveAttribute("id", "upload");
});

it("exposes the mascot to assistive technology only when labelled", () => {
  const { container, rerender } = render(<Capybara />);
  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  rerender(<Capybara pose="happy" label="Capivara feliz" className="w-8" />);
  expect(screen.getByRole("img", { name: "Capivara feliz" })).toHaveAttribute("data-pose", "happy");
});

