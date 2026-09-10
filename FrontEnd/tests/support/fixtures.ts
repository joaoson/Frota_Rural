import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export type Account = { id: string; email: string; password: string };
export type Seed = {
  owner: Account; renter: Account; machines: [string, string]; posting: string; threadId: string;
};
export const apiURL = process.env.E2E_API_URL ?? 'http://localhost:8001/api/';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const seedScript = readFileSync(new URL('./seed_django.py', import.meta.url), 'utf8');

function seed(action: 'create' | 'delete', id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('docker', ['compose', 'exec', '-T', 'backend', 'python', '-', action, id],
      { cwd: repoRoot, timeout: 30_000 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`E2E fixture ${action} failed. Is Docker running?\n${stderr || error.message}`));
        else resolve(stdout);
      });
    child.stdin?.end(seedScript);
  });
}

export async function isolateExternalServices(context: BrowserContext) {
  // Unhandled pricing requests must never reach a real AI provider.
  await context.route('**/api/pricing/suggest', route => route.fulfill({
    status: 422, json: { error: 'Pesquisa externa desativada durante os testes.' },
  }));
  await context.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [] }));
  await context.route('https://viacep.com.br/**', route => route.fulfill({
    json: { localidade: 'Castro', uf: 'PR', cep: '84165-000' },
  }));
  await context.route('https://tile.openstreetmap.org/**', route => route.abort());
}

export const test = base.extend<{ data: Seed; externalServices: void }>({
  // Playwright requires destructured fixture dependencies, including when empty.
  // eslint-disable-next-line no-empty-pattern
  data: async ({}, provide, testInfo) => {
    const id = randomUUID();
    await testInfo.attach('fixture-id', { body: id, contentType: 'text/plain' });
    const data = JSON.parse(await seed('create', id)) as Seed;
    try { await provide(data); } finally { await seed('delete', id); }
  },
  externalServices: [async ({ context }, provide) => {
    await isolateExternalServices(context);
    await provide();
  }, { auto: true }],
});
export { expect };

export async function loginViaUI(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar na Plataforma' }).click();
}

export async function loginViaAPI(context: BrowserContext, account: Account) {
  const response = await context.request.post(`${apiURL}login`, { data: account });
  expect(response.status()).toBe(200);
  return (await response.json() as { access: string }).access;
}

export async function openPostingForm(page: Page, account: Account) {
  await loginViaAPI(page.context(), account);
  await page.goto('/dashboard/novo-anuncio');
  await expect(page.getByRole('heading', { name: 'Novo Anúncio' })).toBeVisible();
  await expect(page.getByRole('combobox')).toBeEnabled();
}
