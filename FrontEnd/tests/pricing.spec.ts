import { test, expect, openPostingForm, apiURL } from './support/fixtures';
import { deferred, suggestion } from './support/pricing';

const suggestLabel = 'Sugerir valor com base no mercado';

test('loads research on demand, applies it only on confirmation, and publishes the chosen price', async ({ page, data }) => {
  const gate = deferred();
  let calls = 0;
  await page.route('**/api/pricing/suggest', async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ machinery: data.machines[0] });
    await gate.promise;
    await route.fulfill({ json: suggestion });
  });
  await openPostingForm(page, data.owner);
  const rate = page.getByLabel('Valor por Hora (R$) *', { exact: true });
  await expect(page.getByRole('button', { name: suggestLabel })).toBeDisabled();
  await page.getByRole('combobox').selectOption(data.machines[0]);
  await rate.fill('250');
  expect(calls).toBe(0);
  try {
    await page.getByRole('button', { name: suggestLabel }).click();
    await expect(page.getByRole('button', { name: 'Pesquisando o mercado...' })).toBeDisabled();
    await expect(rate).toHaveValue('250');
  } finally { gate.resolve(); }
  const apply = page.getByRole('button', { name: /Usar R\$\s*192,15/ });
  await expect(apply).toBeVisible();
  await expect(rate).toHaveValue('250');
  expect(calls).toBe(1);
  await page.getByText('Premissas usadas', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Fonte de mercado de teste' })).toHaveAttribute('href', suggestion.fontes[0].url);
  await apply.click();
  await expect(rate).toHaveValue('192.15');
  // The owner can still override the AI suggestion before publishing.
  await rate.fill('200.50');
  await page.getByLabel('Localização *', { exact: true }).fill('Castro, PR');
  const published = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/postings/' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publicar Anúncio' }).click();
  const response = await published;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({
    machinery: data.machines[0], hourly_rate: '200.50', suggestion_id: suggestion.suggestion_id,
  });
  const posting = await response.json() as { id: string };
  await expect(page).toHaveURL(/\/dashboard$/);
  const persisted = await page.request.get(`${apiURL}postings/${posting.id}`);
  expect((await persisted.json()).hourly_rate).toBe('200.50');
});

test('unavailable market data still allows publishing a manual price', async ({ page, data }) => {
  await page.route('**/api/pricing/suggest', route => route.fulfill({
    status: 422, json: { error: 'Não há dados de mercado suficientes para esta máquina.' },
  }));
  await openPostingForm(page, data.owner);
  await page.getByRole('combobox').selectOption(data.machines[0]);
  await page.getByRole('button', { name: suggestLabel }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Não há dados de mercado suficientes' })).toBeVisible();
  await page.getByLabel('Valor por Hora (R$) *', { exact: true }).fill('180');
  await page.getByLabel('Localização *', { exact: true }).fill('Castro, PR');
  const published = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/postings/' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publicar Anúncio' }).click();
  const response = await published;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().suggestion_id).toBeUndefined();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('a service failure preserves the manual price and can be retried', async ({ page, data }) => {
  let calls = 0;
  await page.route('**/api/pricing/suggest', route => {
    calls++;
    return route.fulfill(calls === 1
      ? { status: 503, json: { error: 'Provider unavailable' } }
      : { json: suggestion });
  });
  await openPostingForm(page, data.owner);
  await page.getByRole('combobox').selectOption(data.machines[0]);
  const rate = page.getByLabel('Valor por Hora (R$) *', { exact: true });
  await rate.fill('280');
  await page.getByRole('button', { name: suggestLabel }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Erro ao consultar a sugestão' })).toBeVisible();
  await expect(rate).toHaveValue('280');
  await page.getByRole('button', { name: suggestLabel }).click();
  await expect(page.getByRole('button', { name: /Usar R\$\s*192,15/ })).toBeVisible();
  await expect(rate).toHaveValue('280');
  expect(calls).toBe(2);
});

test('changing equipment removes the previous suggestion and researches the selected machine', async ({ page, data }) => {
  const requestedMachines: string[] = [];
  await page.route('**/api/pricing/suggest', route => {
    const machine = route.request().postDataJSON().machinery as string;
    requestedMachines.push(machine);
    return route.fulfill({ json: { ...suggestion, sugerido_brl_hora: machine === data.machines[0] ? '192.15' : '240.00' } });
  });
  await openPostingForm(page, data.owner);
  await page.getByRole('combobox').selectOption(data.machines[0]);
  await page.getByRole('button', { name: suggestLabel }).click();
  await expect(page.getByRole('button', { name: /Usar R\$\s*192,15/ })).toBeVisible();
  await page.getByRole('combobox').selectOption(data.machines[1]);
  await expect(page.getByRole('button', { name: /Usar R\$/ })).toHaveCount(0);
  await page.getByRole('button', { name: suggestLabel }).click();
  await expect(page.getByRole('button', { name: /Usar R\$\s*240,00/ })).toBeVisible();
  expect(requestedMachines).toEqual(data.machines);
  await page.getByRole('button', { name: 'Fechar sugestão' }).click();
  await expect(page.getByRole('button', { name: suggestLabel })).toBeEnabled();
});
