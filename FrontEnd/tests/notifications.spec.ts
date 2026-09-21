import type { Page } from '@playwright/test';
import { test, expect, loginViaAPI, apiURL, type Seed } from './support/fixtures';

type Notice = { id: string; title: string; rental: string; is_read: boolean; kind: string };
type Inbox = { results: Notice[]; count: number; unread_count: number };

async function inbox(page: Page, token: string): Promise<Inbox> {
  const response = await page.request.get(`${apiURL}notifications/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Inbox>;
}

async function reserve(page: Page, data: Seed, token: string): Promise<string> {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(18);
  const response = await page.request.post(`${apiURL}rentals/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { postings: data.posting, lessee: data.renter.id,
      start_date: start.toISOString(), end_date: end.toISOString() },
  });
  expect(response.status()).toBe(201);
  return (await response.json() as { id: string }).id;
}

test('rental notifications persist read and dismiss actions independently for each party', async ({ page, browser, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  const ownerContext = await browser.newContext();
  const ownerToken = await loginViaAPI(ownerContext, data.owner);
  await ownerContext.close();
  const rental = await reserve(page, data, token);
  const tenantInbox = await inbox(page, token);
  const ownerInbox = await inbox(page, ownerToken);
  expect(tenantInbox.unread_count).toBe(1);
  expect(ownerInbox.unread_count).toBe(1);
  expect(tenantInbox.results[0].rental).toBe(rental);
  expect(ownerInbox.results[0].id).not.toBe(tenantInbox.results[0].id);

  await page.goto('/dashboard-locatario?tab=notificacoes');
  const panel = page.getByRole('region', { name: 'Notificações', exact: true });
  await expect(panel.getByRole('heading', { name: 'Reserva criada', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notificações, 1 não lidas', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Marcar como lida: Reserva criada', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Marcar como não lida: Reserva criada', exact: true })).toBeVisible();
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Marcar como não lida: Reserva criada', exact: true })).toBeVisible();
  expect((await inbox(page, token)).unread_count).toBe(0);
  expect((await inbox(page, ownerToken)).unread_count).toBe(1);

  await panel.getByRole('button', { name: 'Marcar como não lida: Reserva criada', exact: true }).click();
  await expect(panel.getByText('1 não lidas', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Dispensar notificação: Reserva criada', exact: true }).click();
  await expect(panel.getByText('Nenhuma notificação por enquanto', { exact: true })).toBeVisible();
  await page.reload();
  await expect(panel.getByText('Nenhuma notificação por enquanto', { exact: true })).toBeVisible();
  expect((await inbox(page, token)).count).toBe(0);
  expect((await inbox(page, ownerToken)).count).toBe(1);
  const forbidden = await page.request.patch(`${apiURL}notifications/${ownerInbox.results[0].id}`, {
    headers: { Authorization: `Bearer ${token}` }, data: { is_read: true },
  });
  expect(forbidden.status()).toBe(404);
});

test('refreshes new rental updates automatically and links to the affected rental', async ({ page, data }) => {
  const token = await loginViaAPI(page.context(), data.renter);
  const rental = await reserve(page, data, token);
  await page.clock.install();
  await page.goto('/dashboard-locatario?tab=notificacoes');
  const panel = page.getByRole('region', { name: 'Notificações', exact: true });
  await expect(panel.getByRole('heading', { name: 'Reserva criada', exact: true })).toBeVisible();
  const cancel = await page.request.patch(`${apiURL}rentals/${rental}`, {
    headers: { Authorization: `Bearer ${token}` }, data: { status: 'cancelled' },
  });
  expect(cancel.status()).toBe(200);
  await page.clock.fastForward(31_000);
  await expect(panel.getByRole('heading', { name: 'Reserva cancelada', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notificações, 2 não lidas', exact: true })).toBeVisible();
  await panel.getByRole('combobox', { name: /Tipo de notificação/ }).selectOption('payment');
  await expect(panel.getByText('Nenhuma notificação neste filtro', { exact: true })).toBeVisible();
  await panel.getByRole('combobox', { name: /Tipo de notificação/ }).selectOption('rental');
  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Marcar todas como lidas', exact: true }).click();
  await expect(panel.getByText('0 não lidas', { exact: true })).toBeVisible();
  await panel.getByLabel('Somente não lidas', { exact: true }).check();
  await expect(panel.getByText('Nenhuma notificação neste filtro', { exact: true })).toBeVisible();
  await panel.getByLabel('Somente não lidas', { exact: true }).uncheck();
  const cancellation = panel.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Reserva cancelada', exact: true }) });
  await cancellation.getByRole('link', { name: 'Ver locação', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`tab=locacoes#locacao-${rental}$`));
  await expect(page.locator(`[id="locacao-${rental}"]`)).toBeVisible();
});

test('canceling an obsolete notification filter does not report a connection failure', async ({ page, data }) => {
  const notificationErrors: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && text.includes('HTTP') && text.includes('notifications/') && text.includes('falhou')) {
      notificationErrors.push(text);
    }
  });

  let releasePayment!: () => void;
  const paymentGate = new Promise<void>(resolve => { releasePayment = resolve; });
  let paymentStarted!: () => void;
  const paymentRequestStarted = new Promise<void>(resolve => { paymentStarted = resolve; });
  const emptyInbox = { results: [], count: 0, unread_count: 0 };
  await page.route('**/api/notifications/**', async route => {
    const kind = new URL(route.request().url()).searchParams.get('kind');
    if (kind === 'payment') {
      paymentStarted();
      await paymentGate;
      // The browser has already canceled this obsolete request when the gate opens.
      await route.fulfill({ json: emptyInbox }).catch(() => undefined);
    } else if (kind === 'contract') {
      await route.fulfill({ json: emptyInbox });
    } else {
      await route.continue();
    }
  });

  try {
    await loginViaAPI(page.context(), data.renter);
    await page.goto('/dashboard-locatario?tab=notificacoes');
    const panel = page.getByRole('region', { name: 'Notificações', exact: true });
    await expect(panel.getByText('Nenhuma notificação por enquanto', { exact: true })).toBeVisible();
    const filter = panel.getByRole('combobox', { name: /Tipo de notificação/ });
    const canceledPayment = page.waitForEvent('requestfailed', request => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/notifications/') && url.searchParams.get('kind') === 'payment';
    });
    await filter.selectOption('payment');
    await paymentRequestStarted;
    await expect(panel.getByText('Carregando notificações...', { exact: true })).toBeVisible();
    await filter.selectOption('contract');
    await canceledPayment;
    await expect(filter).toHaveValue('contract');
    await expect(panel.getByText('Nenhuma notificação neste filtro', { exact: true })).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(notificationErrors).toEqual([]);
  } finally {
    releasePayment();
  }
});
