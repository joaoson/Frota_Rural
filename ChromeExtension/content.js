(() => {
  const config = globalThis.FrotaRuralValidation;
  let settings;
  let panel;
  let mountedForm;
  let status;
  let buttons = [];
  let filling = false;
  let scheduled = false;

  function loginFields() {
    const email = document.querySelector('form input[name="email"]') || document.getElementById("e-mail");
    const form = email?.form;
    const password = form?.querySelector('input[name="password"]') || document.getElementById("senha");
    const submit = form?.querySelector('button[type="submit"]');
    if (!(email instanceof HTMLInputElement) || !(password instanceof HTMLInputElement) ||
      !form || password.form !== form || !submit) return null;
    return { email, password, form, submit };
  }

  function removePanel() {
    panel?.remove();
    panel = null;
    mountedForm = null;
    buttons = [];
  }

  function setField(input, value) {
    // Use the browser setter so React's controlled-input tracker sees the change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function chooseRole(role) {
    const initial = loginFields();
    if (filling || !initial || initial.submit.disabled) return;
    filling = true;
    syncPanel();
    try {
      settings = await config.read();
      const fields = loginFields();
      if (!config.matchesPage(location.href, settings) || !fields || fields.form !== initial.form) return;
      const account = settings.accounts[role.id];
      if (!account.email.trim() || !account.password.trim()) {
        status.textContent = "Configure o e-mail e a senha deste perfil no ícone da extensão.";
        return;
      }
      setField(fields.email, account.email.trim());
      setField(fields.password, account.password);
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.role === role.id)));
      status.textContent = `${role.label}: ${account.email.trim()}`;
      // Let React commit both state updates before dispatching the real submit.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!config.matchesPage(location.href, settings) || !fields.form.isConnected || fields.submit.disabled) return;
      if (settings.autoSubmit) {
        fields.form.requestSubmit(fields.submit);
        status.textContent = "Login enviado. Confira o resultado na página. Se falhar, revise a conta na extensão.";
      } else {
        status.textContent = `Credenciais de ${role.label} preenchidas. Clique em Entrar na Plataforma.`;
        fields.submit.focus();
      }
    } catch {
      if (status) status.textContent = "Não foi possível ler as contas. Recarregue a página e revise a extensão.";
    } finally {
      filling = false;
      syncPanel();
    }
  }

  function createPanel(form) {
    panel = document.createElement("frota-rural-validation");
    panel.style.display = "block";
    panel.style.marginBottom = "24px";
    const root = panel.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { color-scheme: light; font: 13px/1.45 system-ui, sans-serif; text-align: left; }
        * { box-sizing: border-box; }
        section { padding: 16px; border: 1px solid #c7dbc8; border-radius: 14px; background: #f4f8ef; color: #173c29; }
        header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        h2 { margin: 0; font-size: 14px; font-weight: 750; }
        .badge { border: 1px solid #c7dbc8; border-radius: 20px; padding: 2px 7px; font: 700 9px/1.5 system-ui; letter-spacing: .08em; }
        p { margin: 6px 0 12px; color: #526752; font-size: 11px; }
        .roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        button { font: inherit; color: #173c29; border: 1px solid #c7dbc8; background: white; padding: 12px 3px; border-radius: 9px; cursor: pointer; }
        button:hover { border-color: #2b6846; background: #e7f1df; }
        button[aria-pressed="true"] { background: #215235; color: white; border-color: #215235; }
        button:focus-visible { outline: 3px solid #b1831d; outline-offset: 2px; }
        button:disabled { opacity: .55; cursor: wait; }
        strong { display: block; font-size: 12px; }
        .hint { margin: 12px 0 0; font-size: 10px; }
        .status { margin: 8px 0 0; overflow-wrap: anywhere; }
        .status:empty { display: none; }
      </style>
      <section aria-label="Validação do Frota Rural">
        <header><h2>Entrar como...</h2><span class="badge">TESTE LOCAL</span></header>
        <p>Escolha um perfil para validar a plataforma.</p>
        <div class="roles"></div>
        <p class="hint">Contas de teste · Configure pelo ícone da extensão.</p>
        <p class="status" role="status" aria-live="polite"></p>
      </section>`;
    status = root.querySelector(".status");
    buttons = config.roles.map((role) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.role = role.id;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", `Entrar como ${role.label}`);
      button.title = role.description;
      const label = document.createElement("strong");
      label.textContent = role.label;
      button.append(label);
      button.addEventListener("click", () => chooseRole(role));
      root.querySelector(".roles").append(button);
      return button;
    });
    form.before(panel);
    mountedForm = form;
  }

  function syncPanel() {
    if (!settings || !config.matchesPage(location.href, settings)) {
      removePanel();
      return;
    }
    const fields = loginFields();
    if (!fields) {
      removePanel();
      return;
    }
    if (!panel?.isConnected || mountedForm !== fields.form) {
      removePanel();
      createPanel(fields.form);
    }
    buttons.forEach((button) => { button.disabled = filling || fields.submit.disabled; });
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      syncPanel();
    });
  }

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  window.addEventListener("popstate", scheduleSync);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[config.storageKey]) return;
    try {
      settings = config.normalize(changes[config.storageKey].newValue);
    } catch {
      settings = null;
    }
    scheduleSync();
  });
  config.read().then((value) => { settings = value; syncPanel(); }).catch(() => {
    settings = null;
    removePanel();
  });
})();
