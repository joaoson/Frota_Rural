<div align="center">
  
# 🚜 Frota Rural

**Conectando o campo com tecnologia e eficiência.**  
Plataforma especializada na locação de maquinário agrícola entre locadores e locatários.

</div>

---

## 📖 Sobre o Projeto

O **Frota Rural** é uma plataforma que visa facilitar o encontro entre proprietários de maquinário agrícola (Locadores) e produtores que necessitam desses equipamentos para suas safras (Locatários).

Através da plataforma, é possível:
- Anunciar equipamentos (tratores, colheitadeiras, etc).
- Buscar e reservar maquinários por período e localização.
- Gerar, assinar e gerenciar contratos de locação digitalmente.
- Realizar validação automática de documentos (CNH) utilizando Machine Learning.
- Trocar mensagens e avaliar o serviço.

## 🛠️ Tecnologias e Arquitetura

O projeto é dividido em três grandes frentes:

### 1. FrontEnd (Interface do Usuário)
Construído com **React** + **Vite**, utilizando **Tailwind CSS** e **shadcn/ui** para uma interface limpa, moderna e responsiva.
- **Node.js**: 20+
- **Comunicação**: Axios para consumir a API REST.
- **Roteamento e Estado**: React Router, com Context API para autenticação.

### 2. BackEnd (API e Regra de Negócio)
Uma API REST robusta construída em **Django** e **Django REST Framework (DRF)**.
- **Python**: 3.14
- **Banco de Dados**: PostgreSQL 17
- **Integrações**: Resend para envio de e-mails, JWT para autenticação.

### 3. Machine Learning (Classificador de Documentos)
Módulo isolado para validação de documentos, usando **TensorFlow** (MobileNetV2) para identificar se um arquivo enviado é uma CNH válida, auxiliando na segurança da plataforma.
- **Python**: 3.13 (Compatibilidade com TensorFlow)

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
Certifique-se de ter instalado em sua máquina:
- **Node.js** (v20+) e npm (v10+)
- **Python** (v3.13 e v3.14)
- **PostgreSQL** (v17)
- **Poppler** (Para leitura de PDFs no ML — Ex: `brew install poppler` no macOS)

### 1. Configurando o Banco de Dados (PostgreSQL)
Crie um banco de dados local chamado `frota_rural`.
Crie o arquivo `.env` na raiz da pasta `BackEnd/` com as seguintes credenciais:
```env
DB_NAME=frota_rural
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_HOST=localhost
DB_PORT=5432
FRONTEND_URL=http://localhost:5173
RESEND_API_KEY=sua_chave_resend
```

### 2. Iniciando o BackEnd (Django)
Abra um terminal e acesse a pasta do backend para configurar o ambiente Django (Python 3.14):

```bash
cd BackEnd
python3.14 -m venv venv
# Ativar no macOS/Linux: source venv/bin/activate
# Ativar no Windows: venv\Scripts\activate
pip install -r docs/requirements.txt
python manage.py migrate
python manage.py runserver
```
A API estará rodando em `http://127.0.0.1:8000/`.

*(Opcional)* Para popular o banco de dados com dados de teste, você pode executar o script `seed.py`.

### 3. Iniciando o Módulo de ML
Ainda na pasta `BackEnd`, abra outro terminal e configure o ambiente do ML (Python 3.13):

```bash
cd BackEnd/ml
python3.13 -m venv venv
# Ativar no macOS/Linux: source venv/bin/activate
# Ativar no Windows: venv\Scripts\activate
pip install -r requirements.txt
```
*Observação: A integração do backend chamará o script de inferência (`classify.py`) usando este interpretador isolado automaticamente.*

### 4. Iniciando o FrontEnd
Abra um novo terminal na raiz do projeto e acesse a pasta `FrontEnd/`:

```bash
cd FrontEnd
npm install
npm run dev
```
A aplicação web estará disponível em `http://localhost:5173/`.

---

## 📂 Estrutura de Diretórios Principal

```text
Frota_Rural/
├── BackEnd/               # API em Django e banco de dados
│   ├── api/               # Models e lógicas de negócio principais
│   ├── ml/                # Treino e Inferência de Machine Learning (TensorFlow)
│   ├── docs/              # Documentações da API (ex: Postman collections)
│   └── manage.py          # Arquivo de gerenciamento do Django
│
├── FrontEnd/              # Interface do usuário web
│   ├── src/               # Código-fonte principal (Páginas, Componentes, Serviços)
│   ├── public/            # Assets estáticos globais
│   └── package.json       # Dependências e scripts npm
│
├── Documentation/         # Requisitos, Diagramas e Especificações do Projeto
│
└── README.md              # Este arquivo
```

---

<div align="center">
  <b>Frota Rural</b> © 2026 — Transformando a locação de maquinário agrícola.
</div>