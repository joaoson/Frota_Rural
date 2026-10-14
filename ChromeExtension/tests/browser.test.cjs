// Runs the real unpacked extension, React form, and local Django API.
// Start the local stack first. Accounts are isolated per run and removed afterward.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

test("real extension: three roles, session restore, React navigation and editable settings", { timeout: 120_000 }, async () => {
  const extension = path.resolve(__dirname, "..");
  const origin = process.env.FROTA_APP_URL || "http://localhost:5173";
  const api = process.env.FROTA_API_URL || "http://localhost:8000/api";
  const backend = process.env.FROTA_TEST_BACKEND;
  assert.ok(backend, "Set FROTA_TEST_BACKEND to this checkout's local backend container");
  for (const url of [origin, api]) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Only local servers may be tested");
  }
  const runId = randomUUID();
  const fixture = (action) => execFileSync("docker", ["exec", "-i", backend, "python", "-", action, runId], {
    input: fs.readFileSync(path.join(__dirname, "fixtures.py")), encoding: "utf8",
  });
  const context = await chromium.launchPersistentContext("", {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }),
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1280, height: 1000 },
  });
  context.setDefaultTimeout(12_000);
  try {
    const accounts = JSON.parse(fixture("create"));
    const options = await context.newPage();
    await options.goto("chrome://extensions");
    const extensionId = await options.locator("extensions-item").filter({ hasText: "Frota Rural · Validação" }).getAttribute("id");
    assert.ok(extensionId, "Chrome must load the actual manifest");
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const fillAccounts = async () => {
      for (const [role, account] of Object.entries(accounts)) {
        await options.locator(`#${role}-email`).evaluate((input) => { input.closest("details").open = true; });
        await options.locator(`#${role}-email`).fill(account.email);
        await options.locator(`#${role}-password`).fill(account.password);
      }
    };
    await options.locator("#app-url").fill(origin);
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await options.getByText("Salvo. Os atalhos já foram atualizados na página de login.", { exact: true }).waitFor();

    const page = await context.newPage();
    const panel = page.locator("frota-rural-validation");
    await page.goto(`${origin}/login`);
    await page.getByRole("button", { name: "Entrar como Admin", exact: true }).click();
    await panel.getByText("Configure o e-mail e a senha deste perfil no ícone da extensão.", { exact: true }).waitFor();
    await fillAccounts();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    const loginRequest = () => page.waitForResponse((response) =>
      response.url().endsWith("/api/login") && response.request().method() === "POST");

    for (const [label, role, email, destination] of [
      ["Locador", "locador", accounts.locador.email, "/dashboard"],
      ["Locatário", "locatario", accounts.locatario.email, "/dashboard-locatario"],
      ["Admin", "admin", accounts.admin.email, "/admin/users"],
    ]) {
      assert.equal((await context.request.post(`${api}/logout`)).status(), 204);
      await page.goto(`${origin}/login`);
      const [response] = await Promise.all([
        loginRequest(),
        page.getByRole("button", { name: `Entrar como ${label}`, exact: true }).click(),
      ]);
      assert.equal(response.status(), 200, `${label} login should succeed with fixture credentials`);
      assert.equal(response.request().postDataJSON().email, email);
      const payload = JSON.parse(Buffer.from((await response.json()).access.split(".")[1], "base64url"));
      assert.equal(payload.role, role, "The real backend must authenticate the selected role");
      await page.waitForURL(`${origin}${destination}`);
      assert.equal(await panel.count(), 0);
      await page.reload();
      await page.getByRole("link", { name: "Entrar", exact: true }).waitFor({ state: "hidden" });
      await page.locator("main, nav, aside").first().waitFor();
      assert.equal(new URL(page.url()).pathname, destination, "HttpOnly refresh session survives reload");
      if (role !== "admin") {
        await page.goto(`${origin}/admin/users`);
        await page.waitForURL(`${origin}${destination}`);
      }
    }

    await context.request.post(`${api}/logout`);
    await page.goto(`${origin}/`);
    await page.getByRole("link", { name: "Entrar", exact: true }).click();
    await panel.waitFor();
    await page.getByRole("link", { name: "Esqueceu a senha?", exact: true }).click();
    await panel.waitFor({ state: "detached" });
    await page.goBack();
    await panel.waitFor();
    assert.equal(await panel.count(), 1, "SPA navigation must not duplicate the panel");

    await options.locator("#auto-submit").uncheck();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.getByRole("button", { name: "Entrar como Locatário", exact: true }).click();
    await panel.getByText("Credenciais de Locatário preenchidas. Clique em Entrar na Plataforma.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "E-mail", exact: true }).inputValue(), accounts.locatario.email);
    assert.equal(await page.getByLabel("Senha", { exact: true }).inputValue(), accounts.locatario.password);
    assert.equal(new URL(page.url()).pathname, "/login");

    // Changing stored credentials updates an already mounted panel.
    await options.locator("#locatario-password").fill("wrong-test-password");
    await options.locator("#auto-submit").check();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    const [rejected] = await Promise.all([
      loginRequest(),
      page.getByRole("button", { name: "Entrar como Locatário", exact: true }).click(),
    ]);
    assert.equal(rejected.status(), 401);
    await page.getByText("E-mail ou senha incorretos.").waitFor();
    await page.waitForFunction(() => !document.querySelector('form button[type="submit"]').disabled);
    assert.equal(await page.getByRole("button", { name: "Entrar como Locatário", exact: true }).isEnabled(), true);
    await options.getByRole("button", { name: "Restaurar contas do seed", exact: true }).click();
    assert.equal(await options.locator("#locatario-email").inputValue(), "maria.oliveira@example.test");
    assert.equal(await options.locator("#admin-email").inputValue(), "");
    await fillAccounts();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();

    await options.locator("#enabled").uncheck();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await panel.waitFor({ state: "detached" });
    await options.locator("#enabled").check();
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await panel.waitFor();

    await options.locator("#app-url").fill("http://localhost:5999");
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await panel.waitFor({ state: "detached" });
    await options.locator("#app-url").fill(origin);
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await panel.waitFor();
    await options.locator("#app-url").fill("https://example.com");
    await options.getByRole("button", { name: "Salvar", exact: true }).click();
    await options.locator('#status[data-error="true"]').waitFor();
    assert.equal(await panel.count(), 1, "Invalid config must not overwrite saved settings");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/login`);
    await panel.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.FROTA_EXTENSION_SCREENSHOT) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.screenshot({ path: process.env.FROTA_EXTENSION_SCREENSHOT, fullPage: true });
    }

    // A corrected account can be retried without reloading or bypassing React.
    const [retried] = await Promise.all([
      loginRequest(),
      page.getByRole("button", { name: "Entrar como Locatário", exact: true }).click(),
    ]);
    assert.equal(retried.status(), 200);
    await page.waitForURL(`${origin}/dashboard-locatario`);
  } finally {
    try { await context.close(); } finally { fixture("delete"); }
  }
});
