import { MemoryRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/app/container";
import Navbar from "@/components/Navbar";
import { DashboardShell } from "@/features/dashboard/components/DashboardShell";
import { AccountSection } from "@/features/dashboard/components/AccountSection";
import { UserAvatar } from "@/shared/components/UserAvatar";
import { HttpError } from "@/shared/http/errors";

import { userKeys } from "../api/UserStore";
import { toDomain } from "../api/userMapper";
import { useUser } from "../hooks/useUsers";
import { userApiSchema } from "../types/userSchemas";

const mocks = vi.hoisted(() => ({ send: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/features/users/hooks/usePortesPropriedade", () => ({ usePortesPropriedade: () => ({ data: [], isLoading: false }) }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ userId: "user-1", isAuthenticated: true, isLoading: false, userRole: "locatario", logout: vi.fn() }) }));
vi.mock("@/features/chat/hooks/useChat", () => ({ useUnreadCount: () => ({ data: { unreadTotal: 0 } }) }));
vi.mock("@/components/NotificationPopover", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/shared/hooks/useCepLookup", () => ({ useCepLookup: () => ({ lookup: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/app/container", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { UserStore } = await import("../api/UserStore");
  const { HttpUserRepository } = await import("../api/UserRepository");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  return { queryClient, userStore: new UserStore(new HttpUserRepository({ send: mocks.send }), queryClient) };
});

const dto = {
  id: "user-1", name: "Ana Silva", document: "52998224725", email: "ana@example.test",
  role: "locatario", address: "Rua A", birth_date: "1990-01-01",
  profile_photo_url: "https://example.test/old.jpg",
};
const newUrl = "https://example.test/new.jpg";

function AccountDashboard() {
  const { data: user } = useUser(dto.id);
  return (
    <DashboardShell items={[]} tab="conta" logoutTab="sair" onTabChange={() => {}} onLogout={() => {}}
      initials="AS" profilePhotoUrl={user?.profilePhotoUrl} accountName={user?.name} accountRole="Locatário">
      <AccountSection userId={dto.id} user={user} roleLabel="Locatário" />
    </DashboardShell>
  );
}

function renderUpload() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar />
        <AccountDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function select(file: File) {
  fireEvent.change(screen.getByLabelText("Selecionar foto de perfil"), { target: { files: [file] } });
}

beforeEach(() => {
  vi.resetAllMocks();
  queryClient.setQueryData(userKeys.detail(dto.id), toDomain(userApiSchema.parse(dto)));
  mocks.send.mockResolvedValue({ status: 200, data: { ...dto, profile_photo_url: newUrl } });
});
afterEach(() => { cleanup(); queryClient.clear(); });

describe("profile photo upload through hook, store and repository", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("sends %s as multipart and updates every avatar from the returned user", async (type) => {
    renderUpload();
    const file = new File(["image"], "photo", { type });
    select(file);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Foto de perfil atualizada."));
    expect(mocks.send).toHaveBeenCalledOnce();
    const request = mocks.send.mock.calls[0][0];
    expect(request).toMatchObject({ method: "POST", path: `users/${dto.id}/photo`, headers: { "Content-Type": undefined } });
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get("image")).toBe(file);
    await waitFor(() => {
      const avatars = screen.getAllByAltText("Foto de perfil");
      expect(avatars).toHaveLength(3);
      avatars.forEach((avatar) => expect(avatar.getAttribute("src")).toBe(newUrl));
    });
  });

  it("rejects unsupported files and files above 5 MB without issuing a request", () => {
    renderUpload();
    select(new File(["pdf"], "file.pdf", { type: "application/pdf" }));
    expect(mocks.error).toHaveBeenLastCalledWith("Tipo de arquivo não suportado. Envie JPG, PNG ou WEBP.");
    select(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }));
    expect(mocks.error).toHaveBeenLastCalledWith("A foto deve ter no máximo 5 MB.");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps the current photo on failure, blocks duplicate uploads, and allows retrying the same file", async () => {
    let reject!: (error: Error) => void;
    mocks.send.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    renderUpload();
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    select(file);
    select(file);
    const button = await screen.findByRole("button", { name: "Enviando foto..." });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.send).toHaveBeenCalledOnce();
    await act(async () => reject(new HttpError("external_service_error", "Erro ao enviar a imagem para o Firebase.", 502)));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Erro ao enviar a imagem para o Firebase."));
    screen.getAllByAltText("Foto de perfil").forEach((avatar) => expect(avatar.getAttribute("src")).toBe(dto.profile_photo_url));
    await screen.findByRole("button", { name: "Alterar foto" });
    select(file);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("maps accounts without a photo and falls back to initials when an image fails", () => {
    expect(toDomain(userApiSchema.parse({ ...dto, profile_photo_url: undefined })).profilePhotoUrl).toBeNull();
    const { rerender } = render(<UserAvatar photoUrl={dto.profile_photo_url} initials="AS" />);
    fireEvent.error(screen.getByAltText("Foto de perfil"));
    expect(screen.getByText("AS")).toBeTruthy();
    rerender(<UserAvatar photoUrl={newUrl} initials="AS" />);
    expect(screen.getByAltText("Foto de perfil").getAttribute("src")).toBe(newUrl);
  });
});
