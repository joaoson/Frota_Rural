import { StrictMode, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import NovoAnuncio from "../NovoAnuncio";

vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "owner-a" }) }));
vi.mock("@/features/machines/hooks/useMachines", () => ({ useMachines: () => ({ data: [], isLoading: false }) }));
vi.mock("@/features/pricing/hooks/usePricingSuggestion", () => ({ usePricingSuggestion: () => ({ suggestion: null }) }));
vi.mock("@/features/postings/hooks/usePostings", () => ({
  useCreatePosting: () => ({ isPending: false }), useUploadPostingPhotos: () => ({ isPending: false }),
}));
vi.mock("@/shared/hooks/useCepLookup", () => ({ useCepLookup: () => ({}), isCepComplete: () => false }));
vi.mock("@/components/MapaLocalizacao", () => ({ default: () => null }));
vi.mock("@/shared/components/PageShell", () => ({ PageShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/shared/components/FileDropzone", () => ({
  FileDropzone: ({ onFiles }: { onFiles: (files: FileList) => void }) => (
    <button type="button" onClick={() => {
      // FileList objects are live. The dropzone clears its input after calling
      // onFiles; queued React updaters must not read it later.
      for (const [name, type] of [["tractor.jpg", "image/jpeg"], ["detail.png", "image/png"]]) {
        const files = [new File(["photo"], name, { type })];
        onFiles(files as unknown as FileList);
        files.length = 0;
      }
    }}>Selecionar fotos</button>
  ),
}));

afterEach(cleanup);

it("retains photos after the picker clears its live file list", () => {
  render(<StrictMode><MemoryRouter><NovoAnuncio /></MemoryRouter></StrictMode>);
  fireEvent.click(screen.getByRole("button", { name: "Selecionar fotos" }));
  expect(screen.getByText("tractor.jpg")).toBeTruthy();
  expect(screen.getByText("detail.png")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "remover" })).toHaveLength(2);
});
