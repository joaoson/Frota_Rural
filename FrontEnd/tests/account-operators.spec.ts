import { test, expect, apiURL, loginViaAPI, loginViaUI } from './support/fixtures';

function uniqueCpf(id: string) {
  const digits = String(BigInt(`0x${id.replaceAll('-', '').slice(0, 14)}`) % 1000000000n).padStart(9, '0').split('').map(Number);
  for (let size = 9; size < 11; size++) {
    const remainder = digits.reduce((total, n, i) => total + n * (size + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join('');
}

test('account edits persist and the changed password can log in again', async ({ page, data }) => {
  await loginViaAPI(page.context(), data.owner);
  await page.goto('/dashboard?tab=conta');
  await expect(page.getByLabel('Nome Completo')).toHaveValue('Playwright owner');
  await page.getByLabel('Nome Completo').fill('Proprietário Atualizado');
  await page.getByLabel('CPF / CNPJ').fill(uniqueCpf(data.owner.id));
  await page.getByLabel('Telefone').fill('11999999999');
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page.getByText('Dados atualizados com sucesso.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nome Completo')).toHaveValue('Proprietário Atualizado');
  const nextPassword = `${data.owner.password}-New`;
  await page.getByLabel('Senha Atual', { exact: true }).fill(data.owner.password);
  await page.getByLabel('Nova Senha', { exact: true }).fill(nextPassword);
  await page.getByLabel('Confirmar Nova Senha', { exact: true }).fill(nextPassword);
  await page.getByRole('button', { name: 'Alterar Senha', exact: true }).click();
  await expect(page.getByText('Senha alterada com sucesso.')).toBeVisible();
  await page.getByRole('button', { name: /Sair/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair', exact: true }).click();
  await loginViaUI(page, { ...data.owner, password: nextPassword });
  await expect(page).toHaveURL(/\/dashboard(?:\?tab=conta)?$/);
});

test('operator create, edit and unlink persist; operator login opens its own account', async ({ page, data }) => {
  const access = await loginViaAPI(page.context(), data.owner);
  await page.goto('/dashboard?tab=operadores');
  await page.getByRole('button', { name: /Cadastrar Operador/ }).click();
  const email = data.owner.email.replace('pw-owner-', 'pw-operator-');
  await page.getByLabel('Nome Completo*').fill('Operador Teste');
  await page.getByLabel('Data de Nascimento*').fill('1990-01-01');
  await page.getByLabel('CPF / CNPJ*').fill(uniqueCpf(data.renter.id));
  await page.getByLabel('E-mail*').fill(email);
  await page.getByLabel('Telefone*').fill('11999999999');
  await page.getByLabel('CEP*').fill('84165000');
  await expect(page.getByLabel('Cidade*')).toHaveValue('Castro');
  await page.getByLabel('Senha Inicial*').fill(data.owner.password);
  await page.getByRole('button', { name: /Cadastrar Operador/ }).click();
  await expect(page.getByRole('heading', { name: 'Operador Teste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Editar/ }).click();
  await page.getByLabel('Nome Completo*').fill('Operador Atualizado');
  await page.getByRole('button', { name: /Salvar Alterações/ }).click();
  await expect(page.getByText('Operador atualizado.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Operador Atualizado' })).toBeVisible();
  await page.getByRole('button', { name: /Desvincular/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desvincular', exact: true }).click();
  await expect(page.getByText('Nenhum operador cadastrado')).toBeVisible();
  const list = await page.request.get(`${apiURL}users/operators`, { headers: { Authorization: `Bearer ${access}` } });
  expect(await list.json()).toEqual([]);
  await loginViaUI(page, { ...data.owner, email });
  await expect(page.getByRole('heading', { name: 'Minha Conta' })).toBeVisible();
  await expect(page.getByLabel('Nome Completo')).toHaveValue('Operador Atualizado');
  await expect(page.getByRole('button', { name: 'Operadores', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Documentos', exact: true }).click();
  await expect(page.getByRole('link', { name: /Nova CNH/ })).toHaveAttribute('href', '/document/cnh');
  await expect(page.getByRole('link', { name: /Nova Certificação/ })).toHaveAttribute('href', '/document/certification');
});

test('login preserves dashboard deep links and roles cannot open the wrong dashboard', async ({ page, data }) => {
  await page.goto('/dashboard-locatario?tab=conta');
  await page.getByLabel('E-mail', { exact: true }).fill(data.renter.email);
  await page.getByLabel('Senha', { exact: true }).fill(data.renter.password);
  await page.getByRole('button', { name: 'Entrar na Plataforma' }).click();
  await expect(page).toHaveURL(/\/dashboard-locatario\?tab=conta$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard-locatario$/);
});
