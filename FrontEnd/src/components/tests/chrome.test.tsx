import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Footer from "../Footer";
import HashDisplay from "../HashDisplay";
import ThemeToggle from "../ThemeToggle";
import { renderWithProviders } from "@/test/render";

const auth = vi.hoisted(() => ({ isAuthenticated: false, userRole: null as string | null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => auth }));

beforeEach(() => { localStorage.clear(); document.documentElement.className = ""; });
afterEach(() => { vi.useRealTimers(); });

const themed = (ui: React.ReactNode, defaultTheme = "light") => render(<ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem={false}>{ui}</ThemeProvider>);

it("toggles between light and dark themes with a short transition", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  themed(<ThemeToggle />);
  await user.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
  expect(document.documentElement).toHaveClass("dark", "theme-switching");
  act(() => { vi.advanceTimersByTime(360); });
  expect(document.documentElement).not.toHaveClass("theme-switching");
  await user.click(screen.getByRole("button", { name: "Ativar tema claro" }));
  expect(document.documentElement).toHaveClass("light");
});

it("offers light, automatic and dark themes as a radio group", async () => {
  const user = userEvent.setup();
  themed(<ThemeToggle variant="segmented" className="w-full" />, "system");
  expect(screen.getByRole("radiogroup", { name: "Tema da interface" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Tema auto" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("radio", { name: "Tema escuro" }));
  expect(screen.getByRole("radio", { name: "Tema escuro" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "Tema auto" })).toHaveAttribute("aria-checked", "false");
});

it("groups a hash for visual comparison and copies it", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(<HashDisplay label="Hash do documento" value="abcdef1234567890xyz" groupSize={8} />);
  expect(screen.getByTitle("abcdef1234567890xyz").children).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Copiar Hash do documento" }));
  expect(writeText).toHaveBeenCalledWith("abcdef1234567890xyz");
  expect(screen.getByText("Copiado")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(2000); });
  expect(screen.getByText("Copiar")).toBeInTheDocument();
});

it("keeps the copy button usable when the clipboard is blocked or the hash is empty", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  render(<HashDisplay label="Hash" value="" />);
  await userEvent.click(screen.getByRole("button", { name: "Copiar Hash" }));
  expect(screen.getByText("Copiar")).toBeInTheDocument();
  expect(screen.getByTitle("").children).toHaveLength(0);
});

it.each([
  [{ isAuthenticated: false, userRole: null }, "Entrar na conta", "/login", true],
  [{ isAuthenticated: true, userRole: "locador" }, "Meu painel", "/dashboard", true],
  [{ isAuthenticated: true, userRole: "locatario" }, "Meu painel", "/dashboard-locatario", false],
])("adapts footer links to the visitor (%j)", (state, accountLabel, accountHref, canAdvertise) => {
  Object.assign(auth, state);
  renderWithProviders(<Footer />);
  expect(screen.getByRole("link", { name: accountLabel })).toHaveAttribute("href", accountHref);
  expect(Boolean(screen.queryByRole("link", { name: "Anunciar frota" }))).toBe(canAdvertise);
  expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Frota Rural`))).toBeInTheDocument();
});
