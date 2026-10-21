import { test, expect, loginViaAPI, prepareContractManagement, apiURL, isolateExternalServices } from './support/fixtures';

test('paid cancellation previews a full refund, persists the reason and keeps a failed refund visible', async ({ page, data }) => {
  const managed = await prepareContractManagement(data);
  const token = await loginViaAPI(page.context(), data.renter);
  await page.goto('/dashboard-locatario?tab=locacoes');
  const card = page.locator(`[id="locacao-${managed.rental}"]`);
  await card.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await expect(card.getByText(/Estorno previsto:/)).toBeVisible();
  await expect(card.getByText(/Valor retido:/)).toContainText('0,00');
  await card.getByLabel('Motivo do cancelamento (opcional)').fill('Colheita adiada');
  await card.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(card.getByText(/Locação Cancelada/)).toBeVisible();
  await expect(card.getByRole('status')).toContainText('Estorno falhou');
  await page.reload();
  await expect(card.getByRole('status')).toContainText('datas já foram liberadas');
  const response = await page.request.get(`${apiURL}rentals/${managed.rental}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await response.json()).toMatchObject({ status: 'cancelled', cancellation_reason: 'Colheita adiada', refunds: [expect.objectContaining({ status: 'failed' })] });
});

test('tenant proposes dates, owner accepts, and both must sign the new revision at the same price', async ({ page, browser, data }) => {
  const managed = await prepareContractManagement(data);
  const token = await loginViaAPI(page.context(), data.renter);
  const auth = { Authorization: `Bearer ${token}` };
  const initial = await (await page.request.get(`${apiURL}rentals/${managed.rental}`, { headers: auth })).json();
  await page.goto('/dashboard-locatario?tab=locacoes');
  await page.locator(`[id="locacao-${managed.rental}"]`).getByRole('button', { name: 'Alterar datas', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const shift = (iso: string) => { const date = new Date(iso); date.setDate(date.getDate() + 10); return date.toISOString().slice(0, 10); };
  await dialog.getByLabel('Novo início', { exact: true }).fill(shift(managed.start));
  await dialog.getByLabel('Novo término', { exact: true }).fill(shift(managed.end));
  await dialog.getByLabel('Motivo da alteração', { exact: true }).fill('Ajustar a colheita');
  await dialog.getByRole('button', { name: 'Solicitar alteração', exact: true }).click();
  await expect(dialog.getByText('Aguardando resposta', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retirar solicitação', exact: true })).toBeVisible();
  const ownerContext = await browser.newContext();
  try {
    await isolateExternalServices(ownerContext);
    await loginViaAPI(ownerContext, data.owner);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`/contrato/${managed.contract}`);
    const panel = ownerPage.getByRole('region', { name: 'Alterações de datas' });
    await expect(panel.getByText(/Datas anteriores:/)).toBeVisible();
    await expect(panel.getByText(/Datas propostas:/)).toBeVisible();
    await panel.getByRole('button', { name: 'Aceitar novas datas', exact: true }).click();
    await expect(panel.getByText('Aceita', { exact: true })).toBeVisible();
    const saved = await (await page.request.get(`${apiURL}rentals/${managed.rental}`, { headers: auth })).json();
    expect(saved).toMatchObject({ total_price: initial.total_price, status: 'active', accepted_by_lessor: false, accepted_by_lessee: false, contract_status: 'pending_signatures' });
    expect(saved.start_date.slice(0, 10)).toBe(shift(managed.start));
    await page.goto(`/contrato/${managed.contract}`);
    await expect(page.getByText(/revisão nº 2/)).toBeVisible();
  } finally { await ownerContext.close(); }
});
