import type { Page } from '@playwright/test';
import { test, expect, loginViaAPI, isolateExternalServices } from './support/fixtures';

function watchSubscription(page: Page, threadId: string) {
  let subscribed = false;
  let messagesSent = 0;
  page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      const event = JSON.parse(String(frame.payload));
      if (event.type === 'thread.subscribed' && event.thread_id === threadId) subscribed = true;
    });
    socket.on('framesent', frame => {
      const event = JSON.parse(String(frame.payload));
      if (event.type === 'message.send') messagesSent++;
    });
  });
  return { subscribed: () => subscribed, sent: () => messagesSent };
}

test('two users exchange messages over WebSocket without duplicates and retain history after reload', async ({ page, browser, baseURL, data }) => {
  const renterContext = await browser.newContext({ baseURL, locale: 'pt-BR', serviceWorkers: 'block' });
  try {
    await isolateExternalServices(renterContext);
    const renter = await renterContext.newPage();
    const ownerSocket = watchSubscription(page, data.threadId);
    const renterSocket = watchSubscription(renter, data.threadId);
    await loginViaAPI(page.context(), data.owner);
    await loginViaAPI(renterContext, data.renter);
    const threadURL = `/mensagens/${encodeURIComponent(data.threadId)}`;
    await Promise.all([page.goto(threadURL), renter.goto(threadURL)]);
    await expect.poll(ownerSocket.subscribed).toBe(true);
    await expect.poll(renterSocket.subscribed).toBe(true);
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
    const question = 'O trator está disponível para amanhã?';
    await renter.getByPlaceholder('Escreva uma mensagem...').fill(question);
    await renter.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.locator('section').getByText(question, { exact: true })).toBeVisible();
    await expect(renter.locator('section').getByText(question, { exact: true })).toHaveCount(1);
    expect(renterSocket.sent()).toBe(1);
    const reply = 'Sim, podemos combinar a entrega.';
    await page.getByPlaceholder('Escreva uma mensagem...').fill(reply);
    await page.getByPlaceholder('Escreva uma mensagem...').press('Enter');
    await expect(renter.locator('section').getByText(reply, { exact: true })).toBeVisible();
    expect(ownerSocket.sent()).toBe(1);
    await renter.reload();
    await expect(renter.locator('section').getByText(question, { exact: true })).toHaveCount(1);
    await expect(renter.locator('section').getByText(reply, { exact: true })).toHaveCount(1);
    await expect(renter.getByPlaceholder('Escreva uma mensagem...')).toHaveValue('');
  } finally { await renterContext.close(); }
});
