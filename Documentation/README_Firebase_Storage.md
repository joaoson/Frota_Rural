# Guia de Configuração: Firebase Storage (fotos dos anúncios)

As fotos dos anúncios são enviadas pelo navegador ao backend Django, que as repassa
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

Em **Storage → Regras**, cole o conteúdo abaixo e publique:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Fotos de anúncio são públicas para leitura (o anúncio também é).
    match /postings/{allPaths=**} {
      allow read: if true;
      allow write: if false;  // escrita só pelo backend, que ignora estas regras
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

O SDK Admin usado pelo Django **não passa por estas regras** — ele autentica com a
service account e tem acesso total. As regras valem apenas para acesso direto do
navegador, que aqui é somente leitura das fotos de anúncio.

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
| Endpoint de upload | `POST /api/postings/<uuid>/photos/` (`BackEnd/postings/views.py`) |
| Montagem da URL pública | `BackEnd/postings/serializer.py` |
| Testes | `BackEnd/postings/tests.py` |
| Envio pelo frontend | `FrontEnd/src/services/PostingService/PostingService.ts` |
