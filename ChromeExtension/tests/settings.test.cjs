const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const directory = path.resolve(__dirname, "..");
const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(directory, "settings.js"), "utf8"), context);
const config = context.FrotaRuralValidation;

test("defaults match the current demo seed; admin requires an explicit account", () => {
  const seed = fs.readFileSync(path.join(directory, "../BackEnd/seed.py"), "utf8");
  for (const role of config.roles.filter(({ id }) => id !== "admin")) {
    const account = config.defaults().accounts[role.id];
    const row = seed.split("\n").find((line) => line.includes(account.email));
    assert.ok(row?.includes(role.id), `Missing seed account for ${role.id}`);
    assert.ok(seed.includes(`DEFAULT_PASSWORD = '${account.password}'`));
  }
  assert.equal(config.defaults().accounts.admin.email, "");
  assert.equal(config.defaults().accounts.admin.password, "");
  assert.equal(config.roles.map((role) => role.id).join(","), "locador,locatario,admin");
});

test("accepts only the configured local protocol, port and login path", () => {
  const settings = config.defaults();
  for (const url of ["http://localhost:5173/login", "http://127.0.0.1:5173/login/", "http://localhost:5173/login?next=dashboard"]) {
    assert.equal(config.matchesPage(url, settings), true, url);
  }
  for (const url of ["https://localhost:5173/login", "http://localhost:5174/login", "http://localhost:5173/signup", "http://localhost:5173/forgot-password", "http://localhost:5173/login/other", "http://localhost.evil.test:5173/login", "https://frotarural.app/login", "invalid"]) {
    assert.equal(config.matchesPage(url, settings), false, url);
  }
  assert.equal(config.matchesPage("http://localhost:5173/login", { ...settings, enabled: false }), false);
  assert.equal(config.matchesPage("http://localhost:5174/login", { ...settings, appUrl: "http://localhost:5174" }), true);
});

test("rejects remote, credential-bearing, malformed and unrelated app URLs", () => {
  for (const url of ["https://example.com", "http://user:password@localhost:5173", "file:///tmp/login", "not a URL", "http://localhost:5173/admin", "http://localhost:5173/?secret=test"]) {
    assert.throws(() => config.appOrigin(url), undefined, url);
  }
  assert.equal(config.appOrigin("http://localhost:5174/login"), "http://localhost:5174");
  assert.throws(() => config.normalize({ appUrl: "https://example.com" }));
});

test("preserves custom and deliberately empty credentials and boolean preferences", () => {
  const saved = config.normalize({ enabled: false, autoSubmit: false, accounts: { admin: { email: "qa@example.test", password: "" } } });
  assert.equal(saved.enabled, false);
  assert.equal(saved.autoSubmit, false);
  assert.equal(saved.accounts.admin.email, "qa@example.test");
  assert.equal(saved.accounts.admin.password, "");
  assert.equal(saved.accounts.locador.email, config.defaults().accounts.locador.email);
  const first = config.defaults();
  first.accounts.admin.email = "changed";
  assert.notEqual(first.accounts.admin.email, config.defaults().accounts.admin.email);
});

test("manifest uses only local hosts and bundled, existing scripts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  for (const script of manifest.content_scripts) {
    for (const match of script.matches) assert.match(match, /^https?:\/\/(localhost|127\.0\.0\.1)\/\*$/);
    for (const file of script.js) assert.ok(fs.existsSync(path.join(directory, file)));
  }
  assert.ok(fs.existsSync(path.join(directory, manifest.action.default_popup)));
});
