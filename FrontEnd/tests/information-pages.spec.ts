import { test, expect } from '@playwright/test';

// These public-page checks must never restore a real session or touch database fixtures.
test.beforeEach(async ({ context }) => {
  await context.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    const authentication = /^\/api\/(?:login|logout|auth)(?:\/|$)/.test(path);
    await route.fulfill({
      status: authentication ? 401 : 200,
      json: authentication ? { detail: 'Sessão não autenticada.' } : { count: 0, results: [] },
    });
  });
});

test('footer information links open complete pages and survive a direct reload', async ({ page }) => {
  await page.goto('/');

  for (const destination of [
    { label: 'Termos de uso', path: '/termos-de-uso', heading: 'Termos de uso', title: 'Termos de uso · Frota Rural' },
    { label: 'Privacidade', path: '/privacidade', heading: 'Privacidade', title: 'Privacidade · Frota Rural' },
    { label: 'Suporte', path: '/help', heading: 'Uma mãozinha para seguir em frente.', title: 'Ajuda · Frota Rural' },
  ]) {
    const footer = page.getByRole('contentinfo');
    await expect(footer.locator('a[href="#"], a:not([href])')).toHaveCount(0);
    await footer.getByRole('link', { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible();
    await expect(page).toHaveTitle(destination.title);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible();
    await expect(page.locator('main .frota-capybara')).toBeVisible();
  }

  await page.goto('/privacidade#navegador');
  await page.reload();
  await expect(page).toHaveURL(/\/privacidade#navegador$/);
  await expect(page.getByRole('heading', { name: 'Cookies e preferências do navegador' })).toBeVisible();
  await expect.poll(async () => page.locator('#navegador').evaluate(section => {
    const top = section.getBoundingClientRect().top;
    return top >= 80 && top < window.innerHeight;
  })).toBe(true);
});

test('help combines accent-insensitive search with categories and recovers from no matches', async ({ page }) => {
  await page.goto('/help');
  const search = page.getByRole('searchbox', { name: 'Buscar na central de ajuda' });
  const filters = page.getByRole('group', { name: 'Filtrar perguntas por assunto' });
  const recurrence = page.locator('summary').filter({ hasText: 'Como programo uma recorrência de aluguel?' });

  await search.fill('RECORRENCIA');
  await expect(recurrence).toBeVisible();
  await filters.getByRole('button', { name: 'Notificações', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Não encontramos essa trilha por aqui.' })).toBeVisible();
  await expect(recurrence).toHaveCount(0);

  await page.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Notificações', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('summary')).toHaveCount(1);
  await expect(page.locator('summary')).toHaveText('Onde vejo as atualizações de locação, pagamento e contrato?');

  await search.fill('nenhuma-pergunta-com-este-termo');
  await page.getByRole('button', { name: 'Ver todas as perguntas' }).click();
  await expect(search).toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Todos os assuntos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(recurrence).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Não encontramos essa trilha por aqui.' })).toHaveCount(0);
});

test('FAQ disclosures work from the keyboard and offer working public shortcuts', async ({ page }) => {
  await page.goto('/help');
  const question = page.locator('summary').filter({ hasText: 'Como programo uma recorrência de aluguel?' });
  const disclosure = page.locator('details').filter({ has: question });

  await question.focus();
  await question.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByText(/Cada nova reserva tem seu próprio pagamento/)).toBeVisible();
  await question.press('Space');
  await expect(disclosure).not.toHaveAttribute('open');

  const shortcuts = page.getByRole('region', { name: 'Por onde você quer começar?' });
  await expect(shortcuts.getByRole('link', { name: /Encontrar uma máquina/ })).toHaveAttribute('href', '/buscar-maquinario');
  await expect(shortcuts.getByRole('link', { name: /Entrar na minha conta/ })).toHaveAttribute('href', '/login');
  await shortcuts.getByRole('link', { name: /Recuperar meu acesso/ }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('heading', { name: /Recuperar|Esqueceu/i }).first()).toBeVisible();
});

test('unknown nested URLs show the 404 page and offer home and help recovery', async ({ page }) => {
  await page.goto('/caminho-inexistente/maquina');
  await expect(page.getByRole('heading', { level: 1, name: 'Opa, saímos da trilha.' })).toBeVisible();
  await expect(page).toHaveTitle('Página não encontrada · Frota Rural');
  await expect(page.getByRole('region', { name: 'Encontre seu caminho' }).getByRole('link', { name: 'Buscar equipamentos' })).toHaveAttribute('href', '/buscar-maquinario');
  await page.getByRole('link', { name: 'Voltar ao início', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Alugue maquinário agrícola perto de você' })).toBeVisible();

  await page.goto('/outra-pagina-inexistente');
  await page.reload();
  await expect(page).toHaveTitle('Página não encontrada · Frota Rural');
  await page.getByRole('region', { name: 'Encontre seu caminho' }).getByRole('link', { name: 'Central de ajuda', exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading', { name: 'Perguntas frequentes' })).toBeVisible();
});

test('public information pages fit a 320px viewport in dark mode with reduced motion', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('frota-rural-theme', 'dark'));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });

  for (const path of ['/help', '/termos-de-uso', '/privacidade', '/nao-encontrada']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main .frota-capybara')).toBeVisible();
    if (path === '/help') await page.locator('summary').first().click();
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    expect(widths.reducedMotion).toBe(true);
    expect(widths.document, `Document overflow on ${path}`).toBeLessThanOrEqual(widths.viewport);
    expect(widths.body, `Body overflow on ${path}`).toBeLessThanOrEqual(widths.viewport);
  }
});

test('the home mascot preserves guide poses, greetings and help navigation', async ({ page }) => {
  await page.goto('/');
  const companion = page.locator('.frota-companion');
  const mascot = companion.locator('.frota-capybara');
  await expect(mascot).toHaveAttribute('data-pose', 'curious');

  await companion.getByRole('button', { name: 'Quero anunciar' }).click();
  await expect(mascot).toHaveAttribute('data-pose', 'wink');
  await expect(companion.getByRole('link', { name: 'Começar meu cadastro' })).toHaveAttribute('href', '/login');
  await companion.getByRole('button', { name: 'Cumprimentar a capivara da Frota Rural' }).click();
  await expect(mascot).toHaveAttribute('data-pose', 'happy');
  await expect(companion.getByText('Bom ter você por aqui!')).toBeVisible();
  await companion.getByRole('button', { name: 'Cumprimentar a capivara da Frota Rural' }).click();
  await expect(mascot).toHaveAttribute('data-pose', 'wink');
  await expect(companion.getByText('Conte comigo, produtor.')).toBeVisible();

  await companion.getByRole('button', { name: 'Como funciona' }).click();
  await expect(mascot).toHaveAttribute('data-pose', 'welcome');
  await expect(companion.getByText('Um aceno para começar?')).toBeVisible();
  await companion.getByRole('link', { name: 'Conhecer a Frota Rural' }).click();
  await expect(page).toHaveURL(/\/help$/);
});
