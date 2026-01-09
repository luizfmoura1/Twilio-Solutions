# Twilio Solutions

Sistema completo de telefonia VoIP integrado com Twilio para gestão de chamadas, filas, gravações e automações.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TWILIO SOLUTIONS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │   Cliente   │────►│   Twilio    │────►│   Flask     │              │
│  │  (Telefone) │     │   Cloud     │     │   API       │              │
│  └─────────────┘     └─────────────┘     └──────┬──────┘              │
│                                                  │                      │
│                            ┌─────────────────────┼─────────────────┐   │
│                            │                     │                 │   │
│                       ┌────▼────┐          ┌─────▼─────┐    ┌─────▼───┐│
│                       │ TaskRouter│         │  Database │    │  Flex   ││
│                       │  (Fila)  │          │  (SQLite) │    │  (SDR)  ││
│                       └──────────┘          └───────────┘    └─────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Funcionalidades

### Implementadas

| Feature | Descrição | Status |
|---------|-----------|--------|
| Disclaimer de Gravação | Aviso automático no início da chamada | ✅ |
| Fila de Espera | Música de espera enquanto aguarda atendimento | ✅ |
| Integração Flex | Chamadas direcionadas para agentes no Twilio Flex | ✅ |
| Gravação Dual-Channel | Gravação separada de cliente e agente | ✅ |
| Webhooks de Status | Recebe atualizações em tempo real das chamadas | ✅ |
| Autenticação JWT | Proteção de endpoints da API | ✅ |
| Sistema de Usuários | Registro e login com hash de senha | ✅ |

### Roadmap

| Feature | Descrição | Complexidade |
|---------|-----------|--------------|
| Blacklist / Opt-out | Não ligar para números bloqueados | 🟢 Baixa |
| AMD (Machine Detection) | Detectar se atendeu humano ou caixa postal | 🟡 Média |
| Whisper | Mensagem que só o agente ouve antes de atender | 🟡 Média |
| Failover (Siga-me) | Redirecionar se agente não atender | 🔴 Alta |
| Rotação de Caller ID | Alternar números de origem | 🔴 Alta |
| Alertas Slack | Notificações de chamadas no Slack | 🟡 Média |
| SMS Automático | Envio de SMS via API | 🟡 Média |
| Dashboard | Painel de controle e relatórios | 🔴 Alta |

## Estrutura do Projeto

```
twilio_dev/
├── app.py                 # Aplicação principal Flask
├── config.py              # Configurações centralizadas
├── database.py            # Conexão com banco de dados
├── requirements.txt       # Dependências Python
├── .env.example           # Exemplo de variáveis de ambiente
├── .gitignore            # Arquivos ignorados pelo Git
│
├── models/               # Modelos do banco de dados
│   ├── __init__.py
│   └── user.py           # Modelo de usuário
│
└── auth/                 # Módulo de autenticação
    ├── __init__.py
    ├── decorators.py     # @jwt_required, @validate_twilio_signature
    ├── jwt_utils.py      # Criação e validação de tokens
    └── routes.py         # Endpoints /register, /login, /me
```

## Instalação

### Pré-requisitos

- Python 3.10+
- Conta Twilio (com créditos)
- Twilio Flex configurado
- ngrok (para desenvolvimento local)

### Setup

1. **Clone o repositório**
```bash
git clone https://github.com/luizfmoura1/Twilio-Solutions.git
cd Twilio-Solutions
```

2. **Crie um ambiente virtual**
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
```

3. **Instale as dependências**
```bash
pip install -r requirements.txt
```

4. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
# Edite .env com suas credenciais
```

5. **Inicie o ngrok** (outro terminal)
```bash
ngrok http 5000
```

6. **Execute a aplicação**
```bash
python app.py
```

## Endpoints da API

### Autenticação

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/auth/register` | Criar novo usuário | - |
| POST | `/auth/login` | Login, retorna JWT | - |
| GET | `/auth/me` | Dados do usuário atual | JWT |

### Chamadas

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/make_call` | Iniciar chamada outbound | JWT |

### Webhooks Twilio

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/voice` | Atende chamada, toca disclaimer | Twilio Signature |
| POST | `/wait` | Música de espera na fila | Twilio Signature |
| POST | `/assignment` | Callback do TaskRouter | Twilio Signature |
| POST | `/call_status` | Atualizações de status | Twilio Signature |

## Exemplos de Uso

### Registrar Usuário

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@email.com","password":"senha12345"}'
```

### Login

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@email.com","password":"senha12345"}'
```

### Fazer Chamada (com token)

```bash
curl -X POST http://localhost:5000/make_call \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -d "to=+5511999999999"
```

## Configuração Twilio

### 1. Número de Telefone

No Twilio Console, configure o número com:
- **Voice & Fax → A CALL COMES IN → Webhook**
- URL: `https://seu-ngrok.ngrok-free.dev/voice`
- Method: `POST`

### 2. TaskRouter Workflow

Crie um Workflow que direcione chamadas para seus agentes no Flex.

### 3. Twilio Flex

Configure seus Workers (agentes) no Flex para receber as chamadas da fila.

## Segurança

### Proteção de Endpoints

- **JWT (JSON Web Token)**: Endpoints de API (`/make_call`) requerem token válido
- **Twilio Signature**: Webhooks validam assinatura do Twilio
- **Bcrypt**: Senhas são armazenadas com hash seguro

### Variáveis Sensíveis

Nunca commite o arquivo `.env`. Use `.env.example` como referência.

## Integrações Futuras

### CRM (Attio, HubSpot, etc.)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│     CRM     │──JWT───►│  Esta API   │──Twilio─►│   Cliente   │
│  Automação  │         │ /make_call  │         │  (Telefone) │
└─────────────┘         └─────────────┘         └─────────────┘
```

O sistema de autenticação JWT permite integração segura com CRMs para:
- Disparar chamadas automáticas
- Enviar SMS (quando implementado)
- Notificações baseadas em eventos

## Desenvolvimento

### Executar em Modo Debug

```bash
python app.py
# ou
flask run --debug
```

### Desabilitar Validação Twilio (dev)

No `.env`:
```
SKIP_TWILIO_VALIDATION=true
```

## Licença

Este projeto é privado e de uso interno.

## Contato

- **Repositório**: https://github.com/luizfmoura1/Twilio-Solutions
