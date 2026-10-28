import type { Page } from '@playwright/test';
import { test, expect, loginViaAPI } from './support/fixtures';

// Until Material Symbols loads, icons render as their ligature names ("notifications"),
// which widens narrow viewports. Reloads refetch it because routed contexts skip the cache.
async function waitForIconFont(page: Page) {
  await page.evaluate(() => document.fonts.load('24px "Material Symbols Outlined"'));
}

for (const width of [360, 768, 1440]) {
  test(`owner preferences survive reload and reset without horizontal overflow at ${width}px`, async ({ page, data }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginViaAPI(page.context(), data.owner);
    await page.goto('/dashboard?tab=frota');
    const search = page.getByPlaceholder('Buscar por marca, modelo ou registro...');
    await expect(page.getByRole('heading', { name: 'John Deere 6110J', exact: true })).toBeVisible();
    await search.fill('6125');
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByLabel('Itens por página').selectOption('12');
    await page.reload();
    await expect(search).toHaveValue('6125');
    await expect(page.getByRole('button', { name: 'Lista', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Itens por página')).toHaveValue('12');
    await expect(page.getByRole('heading', { name: 'John Deere 6125J', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'John Deere 6110J', exact: true })).toHaveCount(0);
    await waitForIconFont(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/dashboard-owner-${width}.png`, fullPage: true });
    if (width < 768) {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await expect(page.getByRole('button', { name: 'Minha frota', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Minha frota', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Restaurar painel', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByLabel('Itens por página')).toHaveValue('6');
    await expect(page.getByRole('heading', { name: 'John Deere 6110J', exact: true })).toBeVisible();
  });

  test(`tenant contract preferences survive reload at ${width}px`, async ({ page, data }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginViaAPI(page.context(), data.renter);
    await page.goto('/dashboard-locatario?tab=contratos');
    const search = page.getByPlaceholder('Buscar por contrato, locador ou maquinário...');
    await expect(search).toBeVisible();
    await search.fill('John Deere');
    await page.getByRole('button', { name: 'Encerrados', exact: true }).click();
    await page.reload();
    await expect(search).toHaveValue('John Deere');
    await expect(page.getByRole('button', { name: 'Encerrados', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await waitForIconFont(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/dashboard-tenant-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Restaurar painel', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}
