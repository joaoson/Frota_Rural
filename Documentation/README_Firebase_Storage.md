# Guia de Configuração: Firebase Storage (fotos dos anúncios e perfis)

As fotos dos anúncios e de perfil são enviadas pelo navegador ao backend Django, que as repassa
ao **Firebase Storage** usando o SDK Admin. O banco guarda apenas o **caminho** do
objeto (ex.: `postings/<posting_id>/<uuid>.jpg`) — a URL pública é montada em tempo
de resposta pelos serializers.

```
Navegador ──multipart──> Django ──firebase-admin──> Firebase Storage
                            │
                            └── postings_photos.image_url = "postings/<id>/<uuid>.jpg"
```

Guardar o caminho (e não a URL) permite trocar de bucket ou de projeto Firebase sem
reescrever nenhuma linha do banco.

## 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com/> e clique em **Adicionar projeto**.
2. Dê um nome (ex.: `frota-rural`). O Google Analytics é opcional e pode ser desativado.
3. Aguarde a criação e abra o projeto.

## 2. Ativar o Storage

1. No menu lateral, vá em **Build → Storage** e clique em **Começar**.
2. Escolha **Iniciar no modo de produção** (as regras serão ajustadas no passo 4).
3. Selecione a região (recomendado: `southamerica-east1` — São Paulo).

> **Atenção:** o Firebase pode exigir a ativação do faturamento (plano Blaze) para
> criar o bucket. O uso do projeto fica dentro da cota gratuita com folga, mas o
> cartão precisa estar cadastrado.

## 3. Copiar o nome do bucket

Ainda em **Storage**, o nome do bucket aparece no topo da página, no formato
`gs://<algo>`. Copie **apenas o que vem depois de `gs://`**:

- Projetos novos: `frota-rural.firebasestorage.app`
- Projetos antigos: `frota-rural.appspot.com`

## 4. Definir as regras de segurança

Em **Storage → Regras**, publique o arquivo versionado
[`Devops/firebase/storage.rules`](../Devops/firebase/storage.rules), reproduzido abaixo.
Ele inclui os dois prefixos: `postings/` e `profiles/`. Publicar somente a regra dos
anúncios permite salvar a foto de perfil pelo backend, mas a leitura pelo navegador
retorna `403` e o avatar volta às iniciais.

Com a Firebase CLI autenticada, também é possível publicar a configuração versionada:

```bash
cd Devops/firebase
firebase deploy --only storage --project <id-do-projeto>
```

Revise as regras existentes antes de publicar em outro projeto para preservar
eventuais prefixos adicionais.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Fotos de anúncio são públicas para leitura (o anúncio também é).
    match /postings/{allPaths=**} {
      allow read: if true;
      allow write: if false;  // escrita só pelo backend, que ignora estas regras
    }
    // Fotos de perfil usam o mesmo acesso público das fotos de anúncio.
    match /profiles/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

O SDK Admin usado pelo Django **não passa por estas regras** — ele autentica com a
service account e tem acesso total. As regras valem apenas para acesso direto do
navegador, que aqui é somente leitura das fotos de anúncio e de perfil.

## 5. Gerar a chave da service account

1. Abra **⚙️ Configurações do projeto → Contas de serviço**.
2. Clique em **Gerar nova chave privada** e confirme. Um arquivo `.json` será baixado.
3. Mova o arquivo para `Frota_Rural/BackEnd/` e renomeie para
   `firebase-service-account.json`.

> Esse arquivo dá acesso **total** ao projeto Firebase. Ele já está no `.gitignore`
> do backend — nunca faça commit dele nem o envie por chat/e-mail.

## 6. Configurar o `.env` do backend

Preencha as duas variáveis em `Frota_Rural/BackEnd/.env`:

```env
FIREBASE_STORAGE_BUCKET=frota-rural.firebasestorage.app
FIREBASE_CREDENTIALS_FILE=firebase-service-account.json
```

`FIREBASE_CREDENTIALS_FILE` aceita caminho relativo à pasta `BackEnd/` ou absoluto.
Se ficar em branco, o padrão é `BackEnd/firebase-service-account.json`.

## 7. Instalar a dependência e subir o servidor

```bash
cd Frota_Rural/BackEnd
source venv/bin/activate
pip install -r docs/requirements.txt
python manage.py runserver
```

## 8. Testar

1. Faça login como locador e acesse **Dashboard → Novo Anúncio**.
2. Preencha o formulário e arraste uma ou mais fotos (JPG/PNG, até 5MB cada).
   A primeira da lista vira a **capa**; passe o mouse sobre outra para promovê-la.
3. Publique. As fotos aparecem em **Buscar Maquinário** (capa) e na página do
   anúncio, em `/anuncio/<id>` (galeria completa).
4. Confirme no console do Firebase, em **Storage → Arquivos**, que os objetos foram
   criados sob `postings/<posting_id>/`.

## Fotos de perfil

Aplique a migration `users.0006_users_profile_photo` antes de usar o recurso.
Em **Dashboard → Minha Conta → Alterar foto**, selecione JPG, PNG ou WEBP de até
5 MB. O envio é imediato e atualiza a foto da conta, a barra lateral e a navbar.
Contas sem foto, ou cuja imagem não carregue, continuam mostrando as iniciais.

`POST /api/users/<uuid>/photo` recebe o campo multipart `image` e retorna o usuário
com `profile_photo_url`. Somente o titular autenticado pode enviar sua foto.
O banco guarda `users.profile_photo = "profiles/<user_id>/<uuid>.<ext>"`; o
serializer monta a URL com o bucket configurado, como nas fotos de anúncio.
O PATCH de perfil não aceita caminhos ou URLs de imagem fornecidos pelo cliente.

O upload ocorre fora da transação de banco. A substituição usa um bloqueio na
linha do usuário e remove a foto antiga somente depois do commit. Se a gravação
falhar, tenta remover o novo objeto; falhas de limpeza são registradas em log.
Publique também a regra de leitura de `profiles/` acima para exibir as fotos.

O frontend segue componente → hook → store → repository → cliente HTTP injetado.
O store atualiza o cache do usuário após o upload; formulários de dados pessoais
permanecem independentes do envio da foto.

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| `503` com "Configure FIREBASE_STORAGE_BUCKET..." | `.env` sem as variáveis, ou servidor não reiniciado após editá-lo |
| `502` "Erro ao enviar a imagem para o Firebase" | Caminho do JSON errado, bucket inexistente ou sem permissão |
| Upload funciona mas a imagem não carrega na tela | Regras do passo 4 não publicadas, ou nome do bucket incorreto no `.env` |
| `400` "Tipo de arquivo não suportado" | Envie JPG, PNG ou WEBP |

## Referência técnica

| Item | Local |
| --- | --- |
| Cliente do Storage | `BackEnd/djangoapi/firebase_storage.py` |
| Endpoint de upload | `POST /api/postings/<uuid>/photos` (`BackEnd/postings/views/photos.py`) |
| Montagem da URL pública | `BackEnd/postings/serializer.py` |
| Testes | `BackEnd/postings/tests.py` |
| Envio pelo frontend | `FrontEnd/src/features/postings/api/PostingRepository.ts` |
| Validação compartilhada de imagens | `BackEnd/common/images.py` |
| Upload de perfil | `BackEnd/users/views/photos.py` → `BackEnd/users/services.py` |
| URL de perfil | `BackEnd/users/serializer.py` |
| Frontend de perfil | `FrontEnd/src/features/users/{components,hooks,api,types}/` |
| Testes de perfil | `BackEnd/users/test_photos.py`, `FrontEnd/src/features/users/tests/` |
