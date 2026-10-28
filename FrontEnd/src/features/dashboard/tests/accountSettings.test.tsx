import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSection } from '../components/AccountSection';
import OperadoresPanel from '@/components/OperadoresPanel';
import { BadRequestError } from '@/shared/http/errors';
import type { User } from '@/features/users/types/user';

const mocks = vi.hoisted(() => ({ update: vi.fn(), password: vi.fn(), lookup: vi.fn(), list: vi.fn(), updateOperator: vi.fn(), toastError: vi.fn() }));
vi.mock("@/features/users/hooks/usePortesPropriedade", () => ({ usePortesPropriedade: () => ({ data: [], isLoading: false }) }));
vi.mock('@/features/users/hooks/useUsers', () => ({
  useUploadProfilePhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProfile: () => ({ mutateAsync: mocks.update, isPending: false }),
  useChangePassword: () => ({ mutateAsync: mocks.password, isPending: false }),
}));
vi.mock('@/shared/hooks/useCepLookup', () => ({ useCepLookup: () => ({ lookup: mocks.lookup }) }));
vi.mock('@/app/container', () => ({ operatorStore: { list: mocks.list, update: mocks.updateOperator, listFuncoes: () => Promise.resolve([]) }, viaCepClient: { findByCep: mocks.lookup } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));
const user: User = { id: 'user-1', name: 'Ana Silva', email: 'ana@example.test', document: '52998224725', phone: '+5511999999999', address: 'Rua inicial', city: 'São Paulo', state: 'SP', cep: '01001000', role: 'locador', birthDate: '1990-01-01', status: 'active', createdAt: null, profilePhotoUrl: null, portePropriedadeId: null, portePropriedadeNome: null };
const address = (city: string) => ({ city, state: 'SP', street: `Rua ${city}`, neighborhood: '', cep: '01001000', complement: '' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); });
afterEach(cleanup);

describe('account and operator actions', () => {
  it('keeps the newest CEP result and preserves manual address edits', async () => {
    const older = deferred<ReturnType<typeof address>>(); const newer = deferred<ReturnType<typeof address>>();
    mocks.lookup.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<AccountSection userId={user.id} user={user} roleLabel="Locador" />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '02002000' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '03003000' } });
    await act(async () => newer.resolve(address('Nova')));
    await act(async () => older.resolve(address('Antiga')));
    expect((screen.getByLabelText('Cidade') as HTMLInputElement).value).toBe('Nova');
    const pending = deferred<ReturnType<typeof address>>(); mocks.lookup.mockReturnValueOnce(pending.promise);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '04004000' } });
    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Endereço digitado, 100' } });
    await act(async () => pending.resolve(address('Tardia')));
    expect((screen.getByLabelText('Endereço') as HTMLInputElement).value).toBe('Endereço digitado, 100');
  });
  it('submits one profile write while pending and preserves backend validation messages', async () => {
    const pending = deferred<void>(); mocks.update.mockReturnValueOnce(pending.promise);
    render(<AccountSection userId={user.id} user={user} roleLabel="Locador" />);
    const form = screen.getByRole('button', { name: 'Salvar Alterações' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.update).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
    mocks.update.mockRejectedValueOnce(new BadRequestError('Dados inválidos', undefined, { fieldErrors: { document: ['CPF inválido.'] } }));
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('CPF inválido.'));
    expect(screen.getByRole('button', { name: 'Alterar foto' }).getAttribute('type')).toBe('button');
  });
  it('shows new-password validation instead of incorrectly blaming the current password', async () => {
    mocks.password.mockRejectedValueOnce(new BadRequestError('Dados inválidos', undefined, { fieldErrors: { new_password: ['A senha é muito comum.'] } }));
    render(<AccountSection userId={user.id} user={user} roleLabel="Locador" />);
    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'Atual1234' } });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByLabelText('Confirmar Nova Senha'), { target: { value: 'Password123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Alterar Senha' }).closest('form')!);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('A senha é muito comum.'));
  });
  it('preserves an unchanged legacy document when saving unrelated profile fields', async () => {
    render(<AccountSection userId={user.id} user={{ ...user, document: 'DEMO-USER-01' }} roleLabel="Locador" />);
    expect((screen.getByLabelText('CPF / CNPJ') as HTMLInputElement).value).toBe('DEMO-USER-01');
    fireEvent.change(screen.getByLabelText('Nome Completo'), { target: { value: 'Nome Atualizado' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar Alterações' }).closest('form')!);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: user.id, input: expect.objectContaining({ name: 'Nome Atualizado', document: 'DEMO-USER-01' }) }));
    mocks.update.mockClear();
    fireEvent.change(screen.getByLabelText('CPF / CNPJ'), { target: { value: '11111111111' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar Alterações' }).closest('form')!);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('offers retry for operator loading errors and ignores CEP results from a closed form', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    render(<OperadoresPanel />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Nenhum operador cadastrado')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Nenhum operador cadastrado');
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Operador/ }));
    const late = deferred<ReturnType<typeof address>>(); mocks.lookup.mockReturnValueOnce(late.promise);
    fireEvent.change(screen.getByLabelText('CEP*'), { target: { value: '01001000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar formulário' }));
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Operador/ }));
    await act(async () => late.resolve(address('Antiga')));
    expect((screen.getByLabelText('Cidade*') as HTMLInputElement).value).toBe('');
  });
  it('edits an operator without corrupting unchanged legacy identifiers', async () => {
    const operator = { ...user, name: 'Operador (demo)', document: 'DEMO-USER-05' };
    mocks.list.mockResolvedValue([operator]); mocks.updateOperator.mockResolvedValue(operator);
    render(<OperadoresPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }));
    expect((screen.getByLabelText('CPF / CNPJ*') as HTMLInputElement).value).toBe('DEMO-USER-05');
    fireEvent.change(screen.getByLabelText('Telefone*'), { target: { value: '11944443333' } });
    fireEvent.submit(screen.getByRole('button', { name: /Salvar Alterações/ }).closest('form')!);
    await waitFor(() => expect(mocks.updateOperator).toHaveBeenCalledWith(user.id, expect.objectContaining({ document: 'DEMO-USER-05', name: 'Operador (demo)', phone: '+5511944443333' })));
  });
});

it("keeps documents out of the account page, which now has its own dashboard tab", () => {
  render(<MemoryRouter><AccountSection userId={user.id} user={{ ...user, role: "operador" }} roleLabel="Operador" /></MemoryRouter>);
  expect(screen.queryByText("Meus documentos")).toBeNull();
  expect(screen.queryByRole("link", { name: "Enviar ou atualizar CNH" })).toBeNull();
});
