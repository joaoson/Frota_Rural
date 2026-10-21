import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DashboardCollection } from "../components/DashboardCollection";

const items = Array.from({ length: 25 }, (_, index) => ({ id: String(index + 1), name: `Máquina ${index + 1}` }));
const renderItem = (item: typeof items[number]) => <article>{item.name}</article>;
const collection = (records = items, resetKey = "", focusItemId?: string) => (
  <DashboardCollection label="Frota" items={records} resetKey={resetKey} focusItemId={focusItemId} renderItem={renderItem} />
);
afterEach(cleanup);

it("paginates records and resets to the first page when page size changes", () => {
  render(collection());
  expect(screen.getAllByRole("article")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.getByText("7–12 de 25 itens")).toBeTruthy();
  expect(screen.queryByText("Máquina 1")).toBeNull();
  fireEvent.change(screen.getByLabelText("Itens por página"), { target: { value: "12" } });
  expect(screen.getByText("1–12 de 25 itens")).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(12);
  fireEvent.change(screen.getByLabelText("Itens por página"), { target: { value: "48" } });
  expect(screen.getAllByRole("article")).toHaveLength(25);
  expect(screen.queryByRole("navigation")).toBeNull();
});

it("keeps the current page and size when switching views; resets only the page for filters", () => {
  const { rerender } = render(collection());
  fireEvent.change(screen.getByLabelText("Itens por página"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  fireEvent.click(screen.getByRole("button", { name: "Lista" }));
  expect(screen.getByText("13–24 de 25 itens")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lista" }).getAttribute("aria-pressed")).toBe("true");
  rerender(collection(items.slice(5), "new-filter"));
  expect(screen.getByText("1–12 de 20 itens")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Lista" }).getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByLabelText("Itens por página") as HTMLSelectElement).value).toBe("12");
});

it("clamps a removed last page and does not jump back when data grows", () => {
  const { rerender } = render(collection());
  fireEvent.click(screen.getByRole("button", { name: "Página 5" }));
  expect(screen.getByText("25–25 de 25 itens")).toBeTruthy();
  rerender(collection(items.slice(0, 24)));
  expect(screen.getByText("19–24 de 24 itens")).toBeTruthy();
  rerender(collection());
  expect(screen.getByText("19–24 de 25 itens")).toBeTruthy();
  rerender(collection([]));
  expect(screen.getByText("0 itens")).toBeTruthy();
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
});

it("reveals asynchronous deep-linked records without overriding later manual paging", () => {
  const { rerender } = render(collection([], "", "20"));
  rerender(collection(items, "", "20"));
  expect(screen.getByText("Máquina 20")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
  expect(screen.getByText("13–18 de 25 itens")).toBeTruthy();
  rerender(collection(items, "", "25"));
  expect(screen.getByText("Máquina 25")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Itens por página"), { target: { value: "12" } });
  expect(screen.getByText("1–12 de 25 itens")).toBeTruthy();
});

it("applies a single page-size limit across grouped rentals", () => {
  render(<DashboardCollection label="Locações" items={items} getGroup={(item) => Number(item.id) <= 4 ? "Em andamento" : "Passadas"} renderItem={renderItem} />);
  expect(screen.getByRole("heading", { name: "Em andamento" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Passadas" })).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.queryByRole("heading", { name: "Em andamento" })).toBeNull();
  expect(screen.getAllByRole("article")).toHaveLength(6);
});
