# Plano de Desenvolvimento Twilio - Organizado por Complexidade

## Resumo das Tarefas

| # | Tarefa | Complexidade | Dependências |
|---|--------|--------------|--------------|
| 1 | Ambiente Separado (Subcontas) | 🟢 Baixa | - |
| 2 | Aquisição de DIDs (Números) | 🟢 Baixa | Tarefa 1 |
| 3 | Disclaimer de Gravação | 🟢 Baixa | - |
| 4 | Blacklist / Opt-out | 🟢 Baixa | Banco de dados |
| 5 | Webhooks de Status | 🟡 Média | Servidor rodando |
| 6 | Whisper (Sussurro) | 🟡 Média | Tarefa 5 |
| 7 | AMD (Machine Detection) | 🟡 Média | - |
| 8 | Gravação Dual-Channel | 🟡 Média | - |
| 9 | Identidade de Usuário | 🟡 Média | Sistema de login |
| 10 | Roteamento Dedicado | 🟡 Média | Tarefas 2, 9 |
| 11 | Transbordo (Queue) | 🔴 Alta | Tarefas 5, 10 |
| 12 | Failover (Siga-me) | 🔴 Alta | Tarefa 10 |
| 13 | Modelagem do Banco | 🟡 Média | - |
| 14 | Storage Externo (S3) | 🔴 Alta | AWS configurada |
| 15 | Rotação de Caller ID | 🔴 Alta | Tarefa 2, Trust Hub |
| 16 | Notificações Desktop | 🟡 Média | Frontend |
| 17 | Dashboard de Controle | 🔴 Alta | Tarefas 5, 13 |
| 18 | Alertas (Slack/WhatsApp) | 🟡 Média | - |

---

## 🟢 FASE 1 - Fundamentos (Complexidade Baixa)

### Tarefa 1: Ambiente Separado (Subcontas)
**O que é:** Criar subcontas na Twilio para separar ambientes (dev/prod) ou clientes.

**Por que fazer primeiro:** Base para toda a estrutura.

**Passo a passo:**
1. Acesse o Twilio Console
2. Vá em Settings → Subaccounts
3. Clique em "Create new Subaccount"
4. Nomeie como `dev-discador` e `prod-discador`

**Código Python (opcional para automação):**
```python
from twilio.rest import Client

account_sid = 'SEU_ACCOUNT_SID'
auth_token = 'SEU_AUTH_TOKEN'
client = Client(account_sid, auth_token)

# Criar subconta
subaccount = client.api.accounts.create(friendly_name='dev-discador')
print(f"Subconta criada: {subaccount.sid}")
```

---

### Tarefa 2: Aquisição de DIDs (Números)
**O que é:** Comprar números de telefone para fazer/receber chamadas.

**Pré-requisito:** Créditos em dólar na conta Twilio.

**Passo a passo:**
1. No Console, vá em Phone Numbers → Buy a Number
2. Filtre por país (Brasil = +55)
3. Selecione números com capacidade de Voice
4. Compre os números necessários

**Código Python:**
```python
from twilio.rest import Client

client = Client(account_sid, auth_token)

# Buscar números disponíveis no Brasil
available = client.available_phone_numbers('BR').local.list(
    voice_enabled=True,
    limit=10
)

for number in available:
    print(f"Disponível: {number.phone_number}")

# Comprar um número específico
purchased = client.incoming_phone_numbers.create(
    phone_number='+5511999999999'  # número escolhido
)
print(f"Número comprado: {purchased.phone_number}")
```

---

### Tarefa 3: Disclaimer de Gravação
**O que é:** Aviso obrigatório informando que a ligação será gravada.

**Opções:**
- TwiML `<Say>` (texto para voz)
- Arquivo MP3 com áudio gravado

**Código TwiML:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="pt-BR" voice="Polly.Camila">
        Esta ligação poderá ser gravada para fins de qualidade e treinamento.
    </Say>
    <!-- Continua com o resto da chamada -->
</Response>
```

**Código Python (FastAPI):**
```python
from fastapi import FastAPI
from fastapi.responses import Response

app = FastAPI()

@app.post("/voice/disclaimer")
async def disclaimer():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="pt-BR" voice="Polly.Camila">
            Esta ligação poderá ser gravada para fins de qualidade e treinamento.
        </Say>
        <Pause length="1"/>
        <Dial>
            <!-- próximo destino -->
        </Dial>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")
```

---

### Tarefa 4: Blacklist / Opt-out
**O que é:** Sistema para não ligar para números que pediram para sair da lista.

**Pré-requisito:** Banco de dados (PostgreSQL/SQLite).

**Estrutura da tabela:**
```sql
CREATE TABLE blacklist (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blacklist_phone ON blacklist(phone_number);
```

**Código Python:**
```python
import sqlite3

def is_blacklisted(phone_number: str) -> bool:
    """Verifica se número está na blacklist antes de discar"""
    conn = sqlite3.connect('discador.db')
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM blacklist WHERE phone_number = ?", 
        (phone_number,)
    )
    result = cursor.fetchone()
    conn.close()
    return result is not None

def add_to_blacklist(phone_number: str, reason: str = "opt-out"):
    """Adiciona número à blacklist"""
    conn = sqlite3.connect('discador.db')
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO blacklist (phone_number, reason) VALUES (?, ?)",
        (phone_number, reason)
    )
    conn.commit()
    conn.close()

# Uso antes de fazer chamada:
def make_call(to_number: str):
    if is_blacklisted(to_number):
        print(f"Número {to_number} está na blacklist. Chamada cancelada.")
        return None
    
    # Procede com a chamada...
    call = client.calls.create(...)
    return call
```

---

## 🟡 FASE 2 - Funcionalidades Core (Complexidade Média)

### Tarefa 5: Webhooks de Status
**O que é:** Receber atualizações em tempo real sobre o status das chamadas.

**Pré-requisitos:** 
- Servidor (FastAPI/Flask)
- Ngrok para testes locais

**Setup Ngrok:**
```bash
ngrok http 8000
# Copie a URL gerada (ex: https://abc123.ngrok.io)
```

**Código Python (FastAPI):**
```python
from fastapi import FastAPI, Form
from datetime import datetime

app = FastAPI()

@app.post("/webhooks/call-status")
async def call_status_webhook(
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    From: str = Form(...),
    To: str = Form(...),
    CallDuration: str = Form(None),
    Timestamp: str = Form(None)
):
    """Recebe atualizações de status da chamada"""
    print(f"""
    [{datetime.now()}] Status Update:
    - Call SID: {CallSid}
    - Status: {CallStatus}
    - De: {From} -> Para: {To}
    - Duração: {CallDuration}s
    """)
    
    # Salvar no banco de dados
    # update_call_status(CallSid, CallStatus, CallDuration)
    
    return {"status": "received"}

# Ao fazer a chamada, especifique o webhook:
call = client.calls.create(
    to='+5511999999999',
    from_='+5511888888888',
    url='https://seu-servidor.com/voice/twiml',
    status_callback='https://seu-servidor.ngrok.io/webhooks/call-status',
    status_callback_event=['initiated', 'ringing', 'answered', 'completed']
)
```

---

### Tarefa 7: AMD (Machine Detection)
**O que é:** Detectar se quem atendeu é humano ou secretária eletrônica.

**Custo adicional:** $0.0075 por chamada.

**Código Python:**
```python
call = client.calls.create(
    to='+5511999999999',
    from_='+5511888888888',
    url='https://seu-servidor.com/voice/twiml',
    machine_detection='Enable',  # ou 'DetectMessageEnd' para esperar o beep
    async_amd=True,  # Não bloqueia enquanto detecta
    async_amd_status_callback='https://seu-servidor.com/webhooks/amd-result'
)

# Webhook para receber resultado do AMD
@app.post("/webhooks/amd-result")
async def amd_result(
    CallSid: str = Form(...),
    AnsweredBy: str = Form(...)  # 'human', 'machine_start', 'machine_end_beep', etc.
):
    if AnsweredBy == 'human':
        print("Humano atendeu - conectar ao agente")
    elif 'machine' in AnsweredBy:
        print("Secretária eletrônica - desligar ou deixar mensagem")
    
    return {"status": "processed"}
```

---

### Tarefa 8: Gravação Dual-Channel
**O que é:** Gravar áudio do cliente e do agente em canais separados (útil para análise e transcrição).

**Código Python:**
```python
call = client.calls.create(
    to='+5511999999999',
    from_='+5511888888888',
    url='https://seu-servidor.com/voice/twiml',
    record=True,
    recording_channels='dual',  # 'mono' é o padrão
    recording_status_callback='https://seu-servidor.com/webhooks/recording'
)

# TwiML alternativo para gravar durante <Dial>
twiml = """
<Response>
    <Dial record="record-from-answer-dual">
        <Number>+5511777777777</Number>
    </Dial>
</Response>
"""
```

---

### Tarefa 6: Whisper (Sussurro)
**O que é:** Mensagem que só o agente ouve antes de conectar com o cliente.

**Código TwiML:**
```python
@app.post("/voice/dial-with-whisper")
async def dial_with_whisper():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Dial>
            <Number url="https://seu-servidor.com/voice/whisper">
                +5511777777777
            </Number>
        </Dial>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")

@app.post("/voice/whisper")
async def whisper_message():
    """Mensagem que só o agente ouve"""
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="pt-BR" voice="Polly.Camila">
            Chamada do cliente João Silva, conta em atraso há 30 dias.
        </Say>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")
```

---

### Tarefa 13: Modelagem do Banco
**O que é:** Estrutura do banco de dados para armazenar informações das chamadas.

**Schema SQL:**
```sql
-- Tabela principal de chamadas
CREATE TABLE calls (
    id SERIAL PRIMARY KEY,
    call_sid VARCHAR(50) UNIQUE NOT NULL,
    agent_id INTEGER REFERENCES agents(id),
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    status VARCHAR(20),
    duration INTEGER DEFAULT 0,
    cost DECIMAL(10, 4),
    answered_by VARCHAR(20),  -- human, machine, etc.
    recording_url TEXT,
    started_at TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de agentes
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    extension VARCHAR(10),
    twilio_number VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de números (pool)
CREATE TABLE phone_numbers (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    friendly_name VARCHAR(100),
    assigned_agent_id INTEGER REFERENCES agents(id),
    call_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Índices para performance
CREATE INDEX idx_calls_agent ON calls(agent_id);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_created ON calls(created_at);
```

---

## 🔴 FASE 3 - Funcionalidades Avançadas (Complexidade Alta)

### Tarefa 11: Transbordo (Queue)
**O que é:** Colocar chamadas em fila quando todos os agentes estão ocupados.

**Código TwiML + Python:**
```python
@app.post("/voice/incoming")
async def handle_incoming():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="pt-BR">
            Aguarde enquanto transferimos sua chamada.
        </Say>
        <Enqueue waitUrl="/voice/wait-music">suporte</Enqueue>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")

@app.post("/voice/wait-music")
async def wait_music():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="pt-BR">
            Todos os nossos atendentes estão ocupados. 
            Você é o próximo da fila.
        </Say>
        <Play>https://seu-servidor.com/audio/hold-music.mp3</Play>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")

# Agente atende da fila
def agent_dequeue(agent_number: str):
    """Agente pega próxima chamada da fila"""
    call = client.calls.create(
        to=agent_number,
        from_='+5511888888888',
        url='https://seu-servidor.com/voice/connect-queue'
    )
    return call

@app.post("/voice/connect-queue")
async def connect_queue():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Dial>
            <Queue>suporte</Queue>
        </Dial>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")
```

---

### Tarefa 12: Failover (Siga-me)
**O que é:** Se agente não atender, redirecionar para outro número (celular pessoal, etc.).

**Código TwiML:**
```python
@app.post("/voice/dial-with-failover")
async def dial_with_failover():
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Dial timeout="15" action="/voice/failover-check">
            <Number>+5511999999999</Number>
        </Dial>
    </Response>"""
    return Response(content=twiml, media_type="application/xml")

@app.post("/voice/failover-check")
async def failover_check(DialCallStatus: str = Form(...)):
    if DialCallStatus in ['no-answer', 'busy', 'failed']:
        # Tenta número de backup
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say language="pt-BR">Transferindo para celular.</Say>
            <Dial timeout="20" action="/voice/voicemail">
                <Number>+5511988887777</Number>
            </Dial>
        </Response>"""
    else:
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
        <Response></Response>"""
    
    return Response(content=twiml, media_type="application/xml")

@app.post("/voice/voicemail")
async def voicemail(DialCallStatus: str = Form(...)):
    if DialCallStatus in ['no-answer', 'busy', 'failed']:
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say language="pt-BR">
                Deixe sua mensagem após o sinal.
            </Say>
            <Record maxLength="120" 
                    recordingStatusCallback="/webhooks/voicemail"/>
        </Response>"""
    else:
        twiml = """<Response></Response>"""
    
    return Response(content=twiml, media_type="application/xml")
```

---

### Tarefa 15: Rotação de Caller ID
**O que é:** Usar diferentes números como origem para evitar bloqueios/spam.

**Importante:** Registrar números no Trust Hub da Twilio!

**Código Python:**
```python
import random
from datetime import datetime, timedelta

class CallerIDRotator:
    def __init__(self, db_connection):
        self.db = db_connection
    
    def get_next_number(self, strategy='round-robin'):
        """Retorna próximo número para usar como Caller ID"""
        
        if strategy == 'round-robin':
            # Pega o número usado há mais tempo
            query = """
                SELECT phone_number FROM phone_numbers 
                WHERE is_active = TRUE 
                ORDER BY last_used_at ASC NULLS FIRST 
                LIMIT 1
            """
        elif strategy == 'random':
            query = """
                SELECT phone_number FROM phone_numbers 
                WHERE is_active = TRUE 
                ORDER BY RANDOM() 
                LIMIT 1
            """
        elif strategy == 'least-used':
            query = """
                SELECT phone_number FROM phone_numbers 
                WHERE is_active = TRUE 
                ORDER BY call_count ASC 
                LIMIT 1
            """
        
        cursor = self.db.cursor()
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result:
            phone = result[0]
            # Atualiza estatísticas
            cursor.execute("""
                UPDATE phone_numbers 
                SET last_used_at = NOW(), call_count = call_count + 1 
                WHERE phone_number = %s
            """, (phone,))
            self.db.commit()
            return phone
        
        return None

# Uso:
rotator = CallerIDRotator(db_connection)

def make_call_with_rotation(to_number: str):
    from_number = rotator.get_next_number(strategy='round-robin')
    
    call = client.calls.create(
        to=to_number,
        from_=from_number,
        url='https://seu-servidor.com/voice/twiml'
    )
    return call
```

---

## Próximos Passos Recomendados

1. **Comece pela Fase 1** - São tarefas rápidas que formam a base
2. **Configure o servidor** - FastAPI + Ngrok para desenvolvimento
3. **Crie o banco de dados** (Tarefa 13) antes das tarefas que dependem dele
4. **Teste cada funcionalidade isoladamente** antes de integrar

### Checklist de Ambiente

- [ ] Conta Twilio com upgrade (sair do Trial)
- [ ] Créditos em dólar na conta
- [ ] Python 3.8+ instalado
- [ ] Twilio CLI instalado (`npm install -g twilio-cli`)
- [ ] Ngrok instalado para testes
- [ ] Banco de dados configurado (PostgreSQL recomendado)

---

**Qual tarefa você quer começar primeiro?**
