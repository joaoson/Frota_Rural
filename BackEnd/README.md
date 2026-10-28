> API atual: [guia dos serviços](../Documentation/README_Servicos_Backend.md), [catálogo](../Documentation/SERVICOS_BACKEND_CATALOGO.md), [cobertura e evidências](../Documentation/EVIDENCIAS_QUALIDADE.md), [migrações](../Documentation/README_Database_Migrations.md) e [observabilidade](../Devops/OBSERVABILIDADE.md).

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
├── ml/                ← Machine Learning (detalhes em ml/README.md)
│   ├── venv/          ← Python 3.13 + TensorFlow + scikit-learn (treino e inferência)
│   ├── requirements.txt   ← Dependências do ML, compartilhadas pelos dois modelos
│   ├── data/          ← Dados compartilhados, uma subpasta por conjunto
│   │   ├── cnh/, not_cnh/   ← Imagens de treino do modelo de imagem (fora do git)
│   │   ├── names/, cities/  ← Bases do IBGE usadas pelo modelo de dados (versionadas)
│   │   ├── lexicon/, eval/  ← Listas de palavras e casos de avaliação do modelo de dados (versionados)
│   │   └── synth/           ← Dataset sintético em CSV, gerado (fora do git)
│   ├── cnh_image/     ← Modelo 1: o arquivo enviado é uma CNH? (imagem)
│   │   ├── train.py, classify.py
│   │   └── models/cnh_classifier.keras
│   └── cnh_data/      ← Modelo 2: índice de veracidade dos dados digitados (foto × formulário + plausibilidade)
│       ├── train.py, classify.py     ← igual ao cnh_image
│       ├── scripts/, lib/, tests/    ← preparação de dados, código de apoio e testes
│       └── models/cnh_plausibility.joblib
```

**Por que dois venvs?**
O TensorFlow suporta até Python 3.13. O Django e o restante do backend rodam em Python 3.14. A comunicação entre eles acontece via `subprocess`: o Django chama o `classify.py` de cada modelo (`ml/cnh_image/` recebe o caminho de um arquivo; `ml/cnh_data/` recebe o registro e o OCR da foto, se houver, em JSON pelo stdin).

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

## Qualidade de código e testes

As ferramentas de desenvolvimento ficam em um arquivo de dependências separado, fora da imagem Docker:

```bash
pip install -r docs/requirements-dev.txt
```

A configuração de `ruff` (lint + formatter) e `mypy` (tipagem estrita, com os plugins do Django e do DRF) está em `pyproject.toml`. Antes de abrir um PR, os quatro comandos abaixo precisam passar:

```bash
ruff check .
ruff format --check .
mypy .
CHANNEL_LAYER_BACKEND=memory DJANGO_DEBUG=true python manage.py test
```

Os testes rodam sem Redis local graças ao channel layer em memória, que o `settings.py` só aceita com `DJANGO_DEBUG=true`.

## Machine Learning — validação do cadastro de CNH

Dois modelos independentes, cada um no seu módulo (visão geral e comparação em [`ml/README.md`](ml/README.md)):

| Modelo | O que faz | Documentação |
|---|---|---|
| `ml/cnh_image` | Classifica a **imagem** enviada (é uma CNH? TensorFlow/MobileNetV2) e lê os campos por **OCR** (RapidOCR), da CNH antiga e da digital, para preencher o formulário. Só avisa o usuário. | [`ml/cnh_image/README.md`](ml/cnh_image/README.md) |
| `ml/cnh_data` | Calcula o **índice de veracidade** dos dados digitados: conferem com a foto (OCR) e parecem reais? (consistência + regras + scikit-learn). Guarda o índice em `veracity_score` e, se parecerem falsos, grava a CNH como `rejected` com o motivo. | [`ml/cnh_data/README.md`](ml/cnh_data/README.md) |

Fontes dos dados (IBGE, Base dos Dados e o dataset de imagens): [`ml/data/README.md`](ml/data/README.md#referências-de-onde-vêm-os-dados).

Treinar e testar cada um:

```bash
cd BackEnd
./ml/venv/bin/python ml/cnh_image/train.py                                  # precisa das imagens em ml/data/cnh e ml/data/not_cnh
./ml/venv/bin/python ml/cnh_data/train.py                                   # lê (ou gera) ml/data/synth/cnh_records.csv
./ml/venv/bin/python -m unittest discover -s ml/cnh_data/tests -t ml/cnh_data
./ml/venv/bin/python ml/cnh_data/scripts/evaluate_veracity.py                  # calibra o índice (precisa do export_readings.py antes)
./ml/venv/bin/python -m unittest discover -s ml/cnh_image/tests -t ml/cnh_image
./ml/venv/bin/python ml/cnh_image/scripts/evaluate_ocr.py                    # mede o OCR no dataset
```

### Variáveis de ambiente do ML

| Variável | Padrão | Efeito |
|---|---|---|
| `ML_PYTHON` | `ml/venv/bin/python` (no Docker: `/opt/ml-venv/bin/python`) | Interpretador que roda os dois modelos |
| `ML_PLAUSIBILITY_MODE` | `enforce` | `off` não avalia os dados; `shadow` avalia e só registra em log; `enforce` recusa automaticamente. Comece em `shadow` para ver quantos cadastros reais seriam recusados |
| `ML_PLAUSIBILITY_THRESHOLD` | `0.60` | Probabilidade de dado falso a partir da qual o modelo recusa (lida direto pelo `ml/cnh_data/classify.py`) |

## Endereço base e documentação da API

A API local usa `http://127.0.0.1:8000/api` (ajuste a porta conforme o ambiente).
Consulte o [guia dos serviços](../Documentation/README_Servicos_Backend.md) e o
[catálogo de operações](../Documentation/SERVICOS_BACKEND_CATALOGO.md).
Swagger está em `/api/schema/swagger-ui`; ele informa campos, autenticação,
exemplos e erros conforme os serializers atuais. Senhas de cadastro são enviadas
no campo definido pelo serializer, nunca como um hash produzido pelo cliente.

## Notas Adicionais

- Vídeo de base para REST API em Django: https://www.youtube.com/watch?v=NoLF7Dlu5mc
- Se você encontrar problemas de conexão com o banco de dados, verifique as configurações do seu arquivo `.env` e certifique-se de que o PostgreSQL esteja em execução.
- Certifique-se de manter seu ambiente virtual ativado sempre que trabalhar com o projeto.
