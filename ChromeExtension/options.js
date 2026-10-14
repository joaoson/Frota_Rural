(() => {
  const config = globalThis.FrotaRuralValidation;
  const form = document.getElementById("settings-form");
  const fields = document.getElementById("settings-fields");
  const status = document.getElementById("status");
  const accountInputs = {};

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }

  for (const role of config.roles) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.append(document.createTextNode(role.label));
    const preview = document.createElement("span");
    summary.append(preview);
    const container = document.createElement("div");
    container.className = "account-fields";
    accountInputs[role.id] = { preview, details };
    for (const [key, labelText, type] of [["email", "E-mail", "email"], ["password", "Senha", "password"]]) {
      const input = document.createElement("input");
      input.id = `${role.id}-${key}`;
      input.type = type;
      // A profile may be left unconfigured (the demo seed has no admin).
      input.required = false;
      input.autocomplete = key === "password" ? "new-password" : "off";
      input.spellcheck = false;
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.textContent = labelText;
      input.addEventListener("invalid", () => { details.open = true; });
      container.append(label, input);
      accountInputs[role.id][key] = input;
    }
    accountInputs[role.id].email.addEventListener("input", () => {
      preview.textContent = accountInputs[role.id].email.value;
    });
    details.append(summary, container);
    document.getElementById("accounts").append(details);
  }

  function populate(settings) {
    document.getElementById("app-url").value = settings.appUrl;
    document.getElementById("auto-submit").checked = settings.autoSubmit;
    document.getElementById("enabled").checked = settings.enabled;
    for (const role of config.roles) {
      const inputs = accountInputs[role.id];
      inputs.email.value = settings.accounts[role.id].email;
      inputs.password.value = settings.accounts[role.id].password;
      inputs.preview.textContent = inputs.email.value;
    }
  }

  async function save() {
    if (!form.reportValidity()) return null;
    const settings = {
      appUrl: config.appOrigin(document.getElementById("app-url").value.trim()),
      autoSubmit: document.getElementById("auto-submit").checked,
      enabled: document.getElementById("enabled").checked,
      accounts: Object.fromEntries(config.roles.map(({ id }) => [id, {
        email: accountInputs[id].email.value.trim().toLowerCase(),
        password: accountInputs[id].password.value,
      }])),
    };
    if (Object.values(settings.accounts).some((account) => Boolean(account.email) !== Boolean(account.password.trim()))) {
      throw new Error("Preencha e-mail e senha juntos, ou deixe ambos vazios para configurar o perfil depois.");
    }
    await chrome.storage.local.set({ [config.storageKey]: settings });
    populate(settings);
    message("Salvo. Os atalhos já foram atualizados na página de login.");
    return settings;
  }

  async function handleSave(openLogin) {
    message("");
    try {
      const settings = await save();
      if (settings && openLogin) await chrome.tabs.create({ url: `${settings.appUrl}/login` });
    } catch (error) {
      message(error.message || "Não foi possível salvar. Reabra a extensão e tente novamente.", true);
    }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); void handleSave(false); });
  document.getElementById("open-login").addEventListener("click", () => { void handleSave(true); });
  document.getElementById("restore").addEventListener("click", () => {
    const seed = config.defaults();
    for (const role of config.roles) {
      const inputs = accountInputs[role.id];
      inputs.email.value = seed.accounts[role.id].email;
      inputs.password.value = seed.accounts[role.id].password;
      inputs.preview.textContent = inputs.email.value;
    }
    message("Contas do seed restauradas no formulário. Clique em Salvar para aplicar.");
  });
  config.read().then(populate).catch(() => {
    populate(config.defaults());
    message("Não foi possível carregar a configuração. Revise os valores e salve novamente.", true);
  }).finally(() => { fields.disabled = false; });
})();
