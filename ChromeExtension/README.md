# Frota Rural · Extensão de validação

Extensão Chrome (Manifest V3) que adiciona **Locador**, **Locatário** e **Admin** acima do formulário de `/login`. Cada botão preenche uma conta de teste e envia o formulário normal do React. O backend continua validando senha, status e permissões, e o aplicativo continua responsável por cookies, sessão e redirecionamento.

## Instalar

1. Abra `chrome://extensions` no Chrome e ative **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione esta pasta, `ChromeExtension` (a pasta que contém `manifest.json`). Não precisa executar build ou instalar dependências.
3. Fixe **Frota Rural · Validação** no menu de extensões.
4. Inicie o frontend e o backend conforme o README do projeto. Abra `http://localhost:5173/login` e recarregue a página caso ela já estivesse aberta durante a instalação.
5. Escolha **Locador**, **Locatário** ou **Admin** no bloco **Entrar como...**.

Passos de instalação também disponíveis na [documentação oficial do Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Contas iniciais

Locador, locatário e administrador vêm de `BackEnd/seed.py`, com a senha inicial `Teste1234`. Se o seed foi executado com `SEED_DEMO_PASSWORD`, configure essa senha no popup:

| Perfil | E-mail | Destino padrão após login |
| --- | --- | --- |
| Locador | `joao.silva@example.test` | `/dashboard` |
| Locatário | `maria.oliveira@example.test` | `/dashboard-locatario` |
| Admin | `admin@example.test` | `/admin/users` |

As contas precisam existir no banco conectado ao backend. A extensão não cria usuários nem altera o papel de uma conta. Use o [seed seguro e idempotente](../Devops/SEED.md) no banco local. Ele preserva contas e senhas existentes. Bancos antigos podem usar e-mails `@email.com`; nesse caso configure essas contas no popup. O botão Admin exige e-mail e senha antes de enviar.

## Configurar e usar

- Clique no ícone da extensão para editar o endereço local e expandir cada perfil para editar e-mail/senha. Clique em **Salvar**; abas abertas recebem a atualização imediatamente.
- O endereço padrão é `http://localhost:5173`. `localhost` e `127.0.0.1` são aceitos na mesma porta e protocolo configurados. Para Vite em outra porta, altere o endereço no popup.
- Desmarque **Entrar ao escolher o perfil** para apenas preencher as credenciais e enviar manualmente.
- Desmarque **Mostrar os atalhos** para ocultar o bloco sem desinstalar a extensão.
- **Salvar e abrir login** abre uma aba no endereço configurado. Para trocar de perfil, use **Sair** no aplicativo e escolha outra conta no login. Abas do mesmo site compartilham o cookie de sessão; use perfis separados do Chrome se precisar validar usuários simultaneamente.
- Os erros de autenticação continuam aparecendo na própria aplicação. A extensão informa apenas que o formulário foi enviado, sem presumir sucesso.
- Ao atualizar os arquivos da extensão, clique em **Recarregar** em `chrome://extensions` e recarregue a aba do projeto.
- Configurações salvas são preservadas, inclusive um Admin vazio. Após atualizar, preencha o perfil **Admin** com `admin@example.test` e sua senha inicial e clique em **Salvar**. Execute o seed se a conta ainda não existir no banco. Para restaurar os três perfis padrão, use **Restaurar contas do seed → Salvar**.

## Escopo e dados

A extensão atua apenas em `/login` no endereço local configurado e procura os campos `name="email"` e `name="password"`, com suporte aos IDs `e-mail` e `senha` usados na versão anterior. Ela acompanha a navegação do React sem exigir recarga e isola o estilo do bloco com Shadow DOM. Não modifica o código da aplicação, JWTs ou cookies, nem adiciona endpoints de autenticação.

A única permissão de API é `storage`; os content scripts têm acesso somente a `localhost` e `127.0.0.1`. As credenciais ficam em `chrome.storage.local`, sem sincronização e sem criptografia. Use exclusivamente contas de teste. A extensão não tem telemetria nem faz chamadas diretas à API.

## Verificar

As verificações de configuração rodam sem dependências:

```bash
node --test ChromeExtension/tests/settings.test.cjs
```

O teste integrado usa um perfil temporário do Chromium e a extensão real. Cria três contas descartáveis (incluindo admin) apenas em banco local com DEBUG e remove-as ao terminar. Não exige seed. Com frontend e backend em execução, por exemplo no offset 2:

```bash
cd ChromeExtension
npm ci
npx playwright install chromium
FROTA_TEST_BACKEND=frota-local-<hash>-backend-1 \
FROTA_APP_URL=http://localhost:5175 \
FROTA_API_URL=http://localhost:8002/api npm run test:browser
```

Substitua `<hash>` pelo nome exibido por `python3 Devops/dev.py status --port-offset 2`. O teste exige `FROTA_TEST_BACKEND` e recusa bancos remotos. Por padrão usa `http://localhost:5173` e `http://localhost:8000/api`. Para outras portas, configure `FROTA_APP_URL` e `FROTA_API_URL`. `CHROMIUM_PATH` permite usar um Chromium já instalado. As dependências são apenas para o teste; carregar a extensão no Chrome não exige npm.

Para a verificação no navegador, com o projeto em execução e a extensão carregada:

1. Faça login com cada perfil e confirme o destino e as permissões; saia entre os testes.
2. Desative o envio automático e confirme que os campos são preenchidos sem enviar.
3. Configure uma senha incorreta, confirme o erro normal da aplicação e tente novamente com a correta.
4. Navegue da página inicial para `/login`, volte e entre novamente: deve existir apenas um bloco de atalhos.
5. Altere uma conta ou desative os atalhos pelo popup e confirme a atualização na aba aberta.
6. Confirme que o bloco não aparece em cadastro, recuperação de senha ou outra porta local.
