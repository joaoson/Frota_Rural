import { test, expect, loginViaAPI, apiURL, type Seed } from './support/fixtures';
import type { Page } from '@playwright/test';

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function openRecurrence(page: Page, data: Seed) {
  await loginViaAPI(page.context(), data.renter);
  await page.goto('/dashboard-locatario');
  await page.getByRole('button', { name: /Minhas Locações/ }).click();
  await page.getByRole('button', { name: 'Programar recorrência', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Primeira data futura', { exact: true }).fill(futureDate(14));
  await dialog.getByLabel('Frequência', { exact: true }).selectOption('weekly');
  await dialog.getByLabel('Quantidade de novas reservas', { exact: true }).fill('2');
  return dialog;
}

test('reuses a past rental, previews current prices, and creates independent unsigned reservations', async ({ page, data }) => {
  let checkouts = 0;
  await page.route('**/api/rentals/*/checkout', route => {
    checkouts++;
    return route.abort();
  });
  const dialog = await openRecurrence(page, data);
  await dialog.getByRole('button', { name: 'Consultar datas e valores' }).click();
  const preview = dialog.getByRole('region', { name: 'Prévia da recorrência' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('6.048,00');
  expect(checkouts).toBe(0);

  const created = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/rentals/${data.sourceRental}/recurrence`
      && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Criar 2 reservas', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const series = await response.json() as {
    id: string; total_price: string;
    rentals: Array<{ id: string; total_price: string; recurrence: string; recurrence_index: number;
      status: string; accepted_by_lessor: boolean; accepted_by_lessee: boolean;
      initial_hour_meter: number | null; final_hour_meter: number | null }>;
  };
  expect(series.total_price).toBe('6048.00');
  expect(series.rentals).toHaveLength(2);
  for (const [index, rental] of series.rentals.entries()) {
    expect(rental).toMatchObject({
      total_price: '3024.00', status: 'pending', recurrence: series.id, recurrence_index: index + 1,
      accepted_by_lessor: false, accepted_by_lessee: false,
      initial_hour_meter: null, final_hour_meter: null,
    });
  }
  await expect(dialog.getByText('2 novas reservas criadas.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pagar reserva', exact: true })).toHaveCount(2);
  expect(checkouts).toBe(0);

  // A retry after an uncertain network response must not duplicate the series.
  const token = await loginViaAPI(page.context(), data.renter);
  const replay = await page.request.post(`${apiURL}rentals/${data.sourceRental}/recurrence`, {
    headers: { Authorization: `Bearer ${token}` }, data: response.request().postDataJSON(),
  });
  expect(replay.status()).toBe(201);
  expect((await replay.json()).id).toBe(series.id);
  const rentals = await page.request.get(`${apiURL}rentals/?lessee=${data.renter.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(await rentals.json()).toHaveLength(3);
  const original = await page.request.get(`${apiURL}rentals/${data.sourceRental}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(await original.json()).toMatchObject({ total_price: '4321.00', status: 'completed', recurrence: null });
  await dialog.getByRole('button', { name: 'Voltar às locações' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pagar reserva', exact: true })).toHaveCount(2);
});

test('changing the schedule invalidates its preview and a conflicting date creates no partial series', async ({ page, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  const headers = { Authorization: `Bearer ${token}` };
  const previewResponse = await page.request.post(`${apiURL}rentals/${data.sourceRental}/recurrence/preview`, {
    headers, data: { first_start_date: futureDate(14), frequency: 'weekly', occurrences: 2 },
  });
  expect(previewResponse.status()).toBe(200);
  const schedule = await previewResponse.json() as { dates: Array<{ start_date: string; end_date: string }> };
  const dialog = await openRecurrence(page, data);
  await dialog.getByRole('button', { name: 'Consultar datas e valores' }).click();
  await expect(dialog.getByRole('region', { name: 'Prévia da recorrência' })).toBeVisible();
  await dialog.getByLabel('Frequência', { exact: true }).selectOption('monthly');
  await expect(dialog.getByRole('region', { name: 'Prévia da recorrência' })).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Criar 2 reservas', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Frequência', { exact: true }).selectOption('weekly');

  const conflict = await page.request.post(`${apiURL}rentals/`, {
    headers, data: { postings: data.posting, lessee: data.renter.id,
      ...schedule.dates[1], total_price: '3024.00', status: 'pending' },
  });
  expect(conflict.status()).toBe(201);
  await dialog.getByRole('button', { name: 'Consultar datas e valores' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/conflita|disponível/);
  await expect(dialog.getByRole('button', { name: 'Criar 2 reservas', exact: true })).toHaveCount(0);
  const rentals = await page.request.get(`${apiURL}rentals/?lessee=${data.renter.id}`, { headers });
  expect(await rentals.json()).toHaveLength(2);
});
