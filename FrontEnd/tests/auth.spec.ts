import { test, expect, loginViaUI } from './support/fixtures';

test('redirects anonymous visitors and returns to the requested page after login', async ({ page, data }) => {
  await page.goto('/dashboard/novo-anuncio');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-mail', { exact: true }).fill(data.owner.email);
  await page.getByLabel('Senha', { exact: true }).fill(data.owner.password);
  await page.getByRole('button', { name: 'Entrar na Plataforma' }).click();
  await expect(page).toHaveURL(/\/dashboard\/novo-anuncio$/);
  await expect(page.getByRole('heading', { name: 'Novo Anúncio' })).toBeVisible();
});

for (const role of ['owner', 'renter'] as const) {
  test(`${role} login reaches the correct dashboard and survives reload`, async ({ page, data }) => {
    await loginViaUI(page, data[role]);
    const dashboard = role === 'owner' ? /\/dashboard$/ : /\/dashboard-locatario$/;
    await expect(page).toHaveURL(dashboard);
    await page.reload();
    await expect(page.getByRole('link', { name: /Sair/ }).or(page.getByRole('button', { name: /Sair/ })).first()).toBeVisible();
    await expect(page).toHaveURL(dashboard);
  });
}

test('validates an empty login without sending credentials to the backend', async ({ page }) => {
  let submissions = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/login') submissions++;
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar na Plataforma' }).click();
  await expect(page.getByText('E-mail é obrigatório.', { exact: true })).toBeVisible();
  await expect(page.getByText('Senha é obrigatória.', { exact: true })).toBeVisible();
  expect(submissions).toBe(0);
});

test('rejects an incorrect password without opening a protected page', async ({ page, data }) => {
  const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/login');
  await loginViaUI(page, { ...data.owner, password: 'WrongPassword123!' });
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole('button', { name: 'Entrar na Plataforma' })).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});
