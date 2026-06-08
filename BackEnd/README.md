# Frota Rural - BackEnd

Um backend baseado em Django para o projeto Frota Rural.

## Pré-requisitos

Antes de executar este projeto, certifique-se de ter o seguinte instalado:

- **Python 3.14**: O projeto é desenvolvido e testado com Python 3.14.
- **Python 3.13**: Necessário para o ambiente de Machine Learning (TensorFlow não suporta 3.14).
- **PostgreSQL 17**: O banco de dados usado é PostgreSQL versão 17.
- **Ambiente Virtual**: Módulo `venv` do Python para gerenciamento de ambiente isolado.
- **poppler**: Necessário para conversão de PDF em imagem (`brew install poppler` no macOS).

## Estrutura de ambientes virtuais

O projeto usa **dois ambientes virtuais** separados por conta de incompatibilidade entre versões do Python:

```
BackEnd/
├── venv/              ← Django (Python 3.14)
│   └── ...               Roda o servidor, API REST, migrations
│
├── ml/
│   ├── venv/          ← Machine Learning (Python 3.13 + TensorFlow)
│   │   └── ...           Treino e inferência do modelo de classificação
│   ├── data/
│   │   ├── cnh/       ← Imagens de CNH (dataset positivo)
│   │   └── not_cnh/   ← Imagens que NÃO são CNH (dataset negativo)
│   ├── models/
│   │   └── cnh_classifier.keras   ← Modelo treinado (gerado pelo script)
│   ├── train_cnh_classifier.py    ← Script de treino
│   ├── classify.py                ← Script de inferência (chamado via subprocess)
│   └── requirements.txt           ← Dependências do ML (tensorflow, Pillow, pdf2image)
```

**Por que dois venvs?**
O TensorFlow suporta até Python 3.13. O Django e o restante do backend rodam em Python 3.14. A comunicação entre eles acontece via `subprocess` por meio de arquivos temporários que o Django salva e o script de ML com modelo treinado `ml/classify.py`.

## Instruções de Configuração

1. **Clone o repositório** (se ainda não foi feito):

   ```bash
   git clone <repository-url>
   cd Frota_Rural/BackEnd
   ```

2. **Crie e ative o ambiente virtual do Django**:

   ```bash
   python -m venv venv
   source venv/bin/activate  # No Windows: venv\Scripts\activate
   ```

3. **Instale as dependências do Django**:

   ```bash
   pip install -r docs/requirements.txt
   ```

4. **Crie o ambiente virtual do ML**:

   ```bash
   cd ml
   python3.13 -m venv venv
   ./venv/bin/pip install -r requirements.txt
   cd ..
   ```

   > **Nota:** Se `python3.13` não estiver disponível, instale via Homebrew: `brew install python@3.13`

   > **macOS — erro de SSL ao treinar:** Se ao rodar o treino aparecer `SSL: CERTIFICATE_VERIFY_FAILED`, execute o instalador de certificados do Python 3.13:
   >
   > ```bash
   > /Applications/Python\ 3.13/Install\ Certificates.command
   > ```
   >
   > Isso instala os certificados raiz necessários para o download dos pesos do modelo.

5. **Configure o banco de dados PostgreSQL**:
   - Certifique-se de que o PostgreSQL 17 esteja em execução no seu sistema.
   - Crie um banco de dados chamado `frota_rural` (ou conforme especificado no seu arquivo `.env`).
   - Crie um usuário com permissões apropriadas (ex.: `postgres`).

6. **Crie a configuração do ambiente**:
   - Copie ou crie um arquivo `.env` na pasta raiz do projeto com o seguinte conteúdo:

     ```
     DB_NAME=frota_rural
     DB_USER=postgres
     DB_PASSWORD=sua_senha
     DB_HOST=localhost
     DB_PORT=5432

     FRONTEND_URL=http://localhost:5173

     RESEND_API_KEY=re_sua_chave_aqui
     RESEND_SUPPORT_EMAIL=suporte@contato.frotarural.app
     ```

   - Ajuste as credenciais do banco de dados conforme sua configuração do PostgreSQL.
   - Para o envio de e-mails (leia sobre Resend):
     - Crie uma conta e gere uma API key no painel da Resend.
     - Em **desenvolvimento**, você pode usar `onboarding@resend.dev` como remetente sem configuração adicional. Mas já temos o e-mail de suporte, o de cima ali do env de exemplo.
     - Em **produção**, adicione e verifique seu domínio na Resend (configuração de DNS) e troque os valores.

## Executando o Projeto

1. **Ative o ambiente virtual** (se ainda não estiver ativado):

   ```bash
   cd BackEnd
   source venv/bin/activate
   ```

2. **Execute as migrações do banco de dados** (se necessário):

   ```bash
   python manage.py migrate
   ```

3. **Inicie o servidor de desenvolvimento do Django**:

   ```bash
   python manage.py runserver
   ```

4. **Acesse a aplicação**:
   - Abra seu navegador e vá para `http://127.0.0.1:8000/`
   - Para popular o banco de dados, é possível executar o arquivo `seed.py`

## Machine Learning — Classificador de CNH

O projeto inclui um classificador de imagem baseado em TensorFlow que verifica se um arquivo enviado pelo usuário é uma CNH (Carteira Nacional de Habilitação) ou não. Usa transfer learning com MobileNetV2.

### Preparar o dataset

Faça o download e coloque as imagens nas pastas correspondentes:

- Datasets recomendados: `https://github.com/ricardobnjunior/Brazilian-Identity-Document-Dataset` e `https://www.kaggle.com/datasets/prasunroy/natural-images`

```
ml/data/cnh/        ← Fotos/scans de CNH (formato antigo ou novo)
ml/data/not_cnh/    ← Fotos aleatórias, selfies, outros documentos
```

- Formatos aceitos: `.jpg`, `.png`, `.jpeg`
- As pastas devem ter quantidades aproximadamente iguais

### Treinar o modelo

```bash
cd BackEnd
./ml/venv/bin/python ml/train_cnh_classifier.py
```

O script:

1. Carrega as imagens das pastas `data/cnh/` e `data/not_cnh/`
2. Aplica data augmentation (rotação, zoom, brilho, contraste)
3. Usa MobileNetV2 pré-treinado como base (transfer learning)
4. Treina por até 30 epochs com early stopping
5. Salva o melhor modelo em `ml/models/cnh_classifier.keras`

Saída esperada: acurácia de validação >= 85%.

### Testar a inferência manualmente (com venv ativado)

```bash
# Classificar uma imagem
python ml/classify.py /caminho/para/imagem.jpg

# Classificar um PDF
python ml/classify.py /caminho/para/cnh.pdf
```

Saída (JSON):

```json
{
  "is_valid": true,
  "confidence": "high",
  "score": 0.9523
}
```

## Endereço base da API

O endereço base da API é:

```
http://127.0.0.1:8000/api/
```

Você pode ver todas as rotas no arquivo djangoapi/urls.py.

As requisições podem ser feitas via Postman (ou qualquer cliente HTTP). A collection está em `docs/postman/Frota_Rural_API.postman_collection.json`.

Exemplo de requisição POST para criar um usuário (rota: users/create):

Request body (JSON):

```json
{
  "name": "João Silva2",
  "document": "123.456.789-02",
  "email": "joao.silva@example.com",
  "password_hash": "pbkdf2_sha256$720000$randomsalt$hashedpassword",
  "phone": "+5511999999999",
  "role": "locador",
  "status": "active"
}
```

## Notas Adicionais

- Vídeo de base para REST API em Django: https://www.youtube.com/watch?v=NoLF7Dlu5mc
- Se você encontrar problemas de conexão com o banco de dados, verifique as configurações do seu arquivo `.env` e certifique-se de que o PostgreSQL esteja em execução.
- Certifique-se de manter seu ambiente virtual ativado sempre que trabalhar com o projeto.
