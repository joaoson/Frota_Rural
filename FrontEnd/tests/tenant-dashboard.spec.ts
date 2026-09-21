import { test, expect, loginViaAPI, apiURL } from './support/fixtures';

test('tenant reviews target the selected rental, persist after reload and can be deleted', async ({ page, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  await page.goto('/dashboard-locatario?tab=locacoes');
  const rental = page.locator(`[id="locacao-${data.sourceRental}"]`);
  await rental.getByRole('button', { name: 'Avaliar', exact: true }).click();
  await rental.getByPlaceholder('Conte como foi a experiência...').fill('Máquina em boas condições e entrega pontual.');
  const response = page.waitForResponse(r => r.url().endsWith('/api/reviews/') && r.request().method() === 'POST');
  await rental.getByRole('button', { name: 'Enviar Avaliação', exact: true }).click();
  const reviewResponse = await response;
  expect(reviewResponse.status()).toBe(201);
  expect(await reviewResponse.json()).toMatchObject({ rental: data.sourceRental, reviewer: data.renter.id, reviewee: data.owner.id });
  await expect(rental.getByText('Avaliação enviada', { exact: true })).toBeVisible();
  await page.reload();
  await expect(rental.getByRole('button', { name: 'Avaliar', exact: true })).toHaveCount(0);
  await page.goto('/dashboard-locatario?tab=avaliacoes');
  await expect(page.getByText('"Máquina em boas condições e entrega pontual."', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir avaliação de Playwright owner', exact: true }).click();
  await expect(page.getByText('Você ainda não forneceu nenhuma avaliação.', { exact: true })).toBeVisible();
  const reviews = await page.request.get(`${apiURL}reviews/?reviewer=${data.renter.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await reviews.json()).toEqual([]);
});

test('tenant rental filters and confirmed cancellation update the real reservation and contract', async ({ page, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  const start = new Date(); start.setUTCDate(start.getUTCDate() + 20); start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start); end.setUTCHours(18);
  const created = await page.request.post(`${apiURL}rentals/`, { headers: { Authorization: `Bearer ${token}` }, data: { postings: data.posting, lessee: data.renter.id, start_date: start.toISOString(), end_date: end.toISOString() } });
  expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };
  await page.goto('/dashboard-locatario?tab=locacoes');
  const search = page.getByPlaceholder('Buscar por locador, maquinário ou contrato...');
  await search.fill('inexistente');
  await expect(page.getByText('Nenhuma locação encontrada.', { exact: true })).toBeVisible();
  await search.clear();
  const rental = page.locator(`[id="locacao-${id}"]`);
  await rental.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await rental.getByRole('button', { name: 'Manter reserva', exact: true }).click();
  await expect(rental.getByText(/Reserva Pendente/)).toBeVisible();
  await rental.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await rental.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(rental.getByText(/Locação Cancelada/)).toBeVisible();
  await page.reload();
  await expect(rental.getByText(/Locação Cancelada/)).toBeVisible();
  const persisted = await page.request.get(`${apiURL}rentals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await persisted.json()).toMatchObject({ status: 'cancelled', contract_status: 'cancelled' });
});

test('contract filters and PDF action load the actual contract document', async ({ page, data }) => {
  await loginViaAPI(page.context(), data.renter);
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printRequested = 'yes'; }; });
  await page.goto('/dashboard-locatario?tab=contratos');
  await page.getByRole('button', { name: 'Pendentes', exact: true }).click();
  await expect(page.getByText('Nenhum contrato disponível.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Encerrados', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Visualizar Contrato', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Imprimir / Salvar PDF', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/contrato/${data.sourceRental}\\?print=1$`));
  await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
});

test('failed checkout retries and reloads reuse the same reservation', async ({ page, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  const checkouts: string[] = [];
  await page.route('**/api/rentals/*/checkout', async route => {
    checkouts.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 503, json: { detail: 'Pagamentos indisponíveis: provedor em configuração.' } });
  });
  await page.goto(`/reservar/${data.posting}`);
  const firstDay = page.getByTitle('Selecionar data', { exact: true }).first();
  await firstDay.click();
  await firstDay.click();
  await page.getByRole('button', { name: 'Avançar para Pagamento', exact: true }).click();
  const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/rentals/' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Pagar e Avançar', exact: true }).click();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const rental = await response.json() as { id: string };
  await expect(page.getByRole('alert')).toContainText('Pagamentos indisponíveis: provedor em configuração.');
  await expect(page).toHaveURL(new RegExp(`locacao=${rental.id}`));
  await page.getByRole('button', { name: 'Pagar e Avançar', exact: true }).click();
  await expect.poll(() => checkouts.length).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: 'Pagar e Avançar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Pagamentos indisponíveis: provedor em configuração.');
  expect(checkouts).toEqual(Array(3).fill(`/api/rentals/${rental.id}/checkout`));
  const rentals = await page.request.get(`${apiURL}rentals/?lessee=${data.renter.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await rentals.json()).toHaveLength(2);
});
