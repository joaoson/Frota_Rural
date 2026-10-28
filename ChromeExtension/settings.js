// Shared by the popup and the isolated content script; no page globals or tokens.
globalThis.FrotaRuralValidation = (() => {
  const storageKey = "frotaRuralValidation";
  const roles = [
    { id: "locador", label: "Locador", description: "Máquinas e anúncios", email: "joao.silva@example.test" },
    { id: "locatario", label: "Locatário", description: "Busca e locações", email: "maria.oliveira@example.test" },
    { id: "admin", label: "Admin", description: "Moderação e usuários", email: "admin@example.test" },
  ];
  const localHosts = new Set(["localhost", "127.0.0.1"]);

  function appOrigin(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Informe uma URL local válida, como http://localhost:5173.");
    }
    if (!localHosts.has(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Use http ou https com localhost ou 127.0.0.1.");
    }
    if (!["/", "/login", "/login/"].includes(url.pathname) || url.search || url.hash) {
      throw new Error("Informe a origem do projeto, como http://localhost:5173, sem parâmetros.");
    }
    return url.origin;
  }

  function defaults() {
    return {
      appUrl: "http://localhost:5173",
      autoSubmit: true,
      enabled: true,
      accounts: Object.fromEntries(roles.map(({ id, email }) => [id, { email, password: email ? "Teste1234" : "" }])),
    };
  }

  function normalize(saved) {
    const base = defaults();
    if (!saved || typeof saved !== "object") return base;
    // Invalid saved origins fail closed instead of silently selecting a different app.
    const origin = appOrigin(saved.appUrl ?? base.appUrl);
    return {
      appUrl: origin,
      autoSubmit: typeof saved.autoSubmit === "boolean" ? saved.autoSubmit : base.autoSubmit,
      enabled: typeof saved.enabled === "boolean" ? saved.enabled : base.enabled,
      accounts: Object.fromEntries(roles.map(({ id }) => {
        const account = saved.accounts?.[id];
        return [id, {
          email: typeof account?.email === "string" ? account.email : base.accounts[id].email,
          password: typeof account?.password === "string" ? account.password : base.accounts[id].password,
        }];
      })),
    };
  }

  function matchesPage(href, settings) {
    try {
      const page = new URL(href);
      const app = new URL(appOrigin(settings.appUrl));
      return settings.enabled && localHosts.has(page.hostname) && page.protocol === app.protocol &&
        page.port === app.port && /^\/login\/?$/.test(page.pathname);
    } catch {
      return false;
    }
  }

  async function read() {
    const saved = await chrome.storage.local.get(storageKey);
    return normalize(saved[storageKey]);
  }

  return { storageKey, roles, defaults, appOrigin, normalize, matchesPage, read };
})();
