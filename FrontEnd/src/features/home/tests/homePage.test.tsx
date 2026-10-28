import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MascotCompanion from "../components/MascotCompanion";
import Index from "@/pages/public/Index";
import { renderWithProviders } from "@/test/render";

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/features/home/components/MachineFinderChat", () => ({ default: () => <section aria-label="Assistente de busca" /> }));

afterEach(() => { vi.useRealTimers(); });

it("presents the home page with featured machines, steps and the companion", () => {
  renderWithProviders(<Index />);
  expect(screen.getByRole("heading", { level: 1, name: "Alugue maquinário agrícola perto de você" })).toBeInTheDocument();
  expect(screen.getByText("Colheitadeira JD S700")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Assistente de busca" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Encontre uma mão na sua safra." })).toBeInTheDocument();
  for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("href");
});

it("switches the companion's guidance and greets back when tapped", () => {
  vi.useFakeTimers();
  renderWithProviders(<MascotCompanion />);
  const choices = screen.getByRole("group", { name: "Como o mascote pode ajudar" });
  fireEvent.click(within(choices).getByRole("button", { name: "Quero anunciar" }));
  expect(screen.getByRole("heading", { name: "Sua máquina tem mais campo pela frente." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Começar meu cadastro/ })).toHaveAttribute("href", "/login");
  const capybara = screen.getByRole("button", { name: "Cumprimentar a capivara da Frota Rural" });
  fireEvent.click(capybara);
  expect(screen.getByText("Bom ter você por aqui!")).toBeInTheDocument();
  fireEvent.click(capybara);
  expect(screen.getByText("Conte comigo, produtor.")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(1800); });
  expect(screen.getByText("Um aceno para começar?")).toBeInTheDocument();
  fireEvent.click(capybara);
  fireEvent.click(within(choices).getByRole("button", { name: "Como funciona" }));
  expect(screen.getByText("Um aceno para começar?")).toBeInTheDocument();
});

it("tilts toward the mouse unless reduced motion is requested and tracks keyboard use", () => {
  const { container, unmount } = renderWithProviders(<MascotCompanion />);
  const stage = container.querySelector(".frota-companion__parallax") as HTMLElement;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerMove(stage, { pointerType: "mouse", clientX: 100, clientY: 0 });
  expect(stage.style.transform).toContain("rotateY(5deg)");
  fireEvent.pointerMove(stage, { pointerType: "touch", clientX: 0, clientY: 0 });
  expect(stage.style.transform).toContain("rotateY(5deg)");
  fireEvent.pointerLeave(stage);
  expect(stage.style.transform).toBe("");
  const aside = screen.getByRole("complementary");
  fireEvent.keyDown(aside, { key: "Tab" });
  expect(aside).toHaveAttribute("data-keyboard", "true");
  fireEvent.pointerDown(aside);
  expect(aside).toHaveAttribute("data-keyboard", "false");
  const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  fireEvent.pointerMove(stage, { pointerType: "mouse", clientX: 0, clientY: 0 });
  expect(stage.style.transform).toBe("");
  matchMedia.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: /Cumprimentar/ }));
  unmount();
});
