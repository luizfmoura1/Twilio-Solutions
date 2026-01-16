# 🗺️ Roadmap - Sistema de Telefonia Twilio/Flex

## Status Atual ✅

| Funcionalidade | Status |
|----------------|--------|
| Chamadas Inbound | ✅ Funcionando |
| Chamadas Outbound | ✅ Funcionando |
| Gravação Dual-Channel | ✅ Funcionando |
| Webhooks de Status | ✅ Funcionando |
| Alertas (Slack/WhatsApp) | ✅ Funcionando |
| Salvando no Banco | ✅ Funcionando |
| Interface | 🟡 Usando Flex |

---

## 🔴 FASE 1: Produção (CRÍTICO)
**Prazo sugerido:** Esta semana  
**Sem isso, o sistema não pode operar de verdade**

### 1.1 Deploy no Railway
- [ ] Criar conta no [Railway](https://railway.app)
- [ ] Conectar repositório Git
- [ ] Criar banco PostgreSQL
- [ ] Configurar variáveis de ambiente
- [ ] Deploy do Flask

### 1.2 Migrar SQLite → PostgreSQL
- [ ] Instalar `psycopg2-binary`
- [ ] Atualizar DATABASE_URL no .env
- [ ] Testar conexão
- [ ] Migrar dados (se necessário)

### 1.3 Configurações de Produção
- [ ] Mudar `debug=False` no app.py
- [ ] Adicionar Gunicorn ao requirements.txt
- [ ] Criar `Procfile` para Railway
- [ ] Testar localmente com Gunicorn

### 1.4 Atualizar Webhooks na Twilio
- [ ] Pegar URL do Railway (ex: `seu-app.up.railway.app`)
- [ ] Atualizar BASE_URL no .env do Railway
- [ ] Console Twilio → Phone Numbers → Atualizar webhooks:
  - [ ] A call comes in: `https://seu-app.up.railway.app/voice`
  - [ ] Call status changes: `https://seu-app.up.railway.app/call_status`
- [ ] Console Twilio → TaskRouter → Workspace → Settings:
  - [ ] Event Callback URL: `https://seu-app.up.railway.app/taskrouter_event`
- [ ] Console Twilio → TaskRouter → Workflows → Assign to Anyone:
  - [ ] Assignment URL: `https://seu-app.up.railway.app/assignment`

### 1.5 Teste Final de Produção
- [ ] Fazer chamada inbound de teste
- [ ] Fazer chamada outbound de teste
- [ ] Verificar gravação
- [ ] Verificar logs no Railway
- [ ] Verificar dados no PostgreSQL

---

## 🟡 FASE 2: Números + Rotação
**Prazo sugerido:** Após produção estável  
**Melhora taxa de atendimento**

### 2.1 Comprar Números Locais
- [ ] Console Twilio → Phone Numbers → Buy a Number
- [ ] Comprar número da **Florida** (DDD: 305, 786, 407, 954, 561)
- [ ] Comprar número do **Texas** (DDD: 713, 214, 512, 972, 817)
- [ ] Anotar os números comprados:
  - Florida: `+1 _____________`
  - Texas: `+1 _____________`

### 2.2 Implementar Rotação de Caller ID
- [ ] Criar mapeamento DDD → Estado
- [ ] Modificar endpoint `/make_call` para escolher caller ID
- [ ] Adicionar tabela `phone_numbers` no banco (se não existir)
- [ ] Testar ligação para FL (deve sair com número FL)
- [ ] Testar ligação para TX (deve sair com número TX)
- [ ] Testar ligação para outros estados (deve sair com toll-free)

### 2.3 Mapeamento de DDDs

```python
# Florida
FLORIDA_DDDS = ['305', '786', '407', '954', '561', '321', '352', '386', '727', '772', '813', '850', '863', '904', '941', '239']

# Texas  
TEXAS_DDDS = ['713', '214', '512', '972', '817', '210', '281', '325', '361', '409', '430', '432', '469', '682', '806', '830', '832', '903', '915', '936', '940', '956', '979']
```

---

## 🟢 FASE 3: Frontend Lovable
**Prazo sugerido:** Próxima semana  
**Melhora experiência do usuário**

### 3.1 Dashboard (Mais fácil - fazer primeiro)
- [ ] Criar projeto no Lovable
- [ ] Tela de login
- [ ] Dashboard com métricas:
  - [ ] Total de chamadas hoje/semana/mês
  - [ ] Chamadas atendidas vs não atendidas
  - [ ] Duração média
  - [ ] Gráficos de tendência
- [ ] Lista de chamadas recentes
- [ ] Player de gravações
- [ ] Conectar com API do backend (`/calls`, `/calls/{id}`)

### 3.2 Softphone (Mais complexo - fazer depois)
- [ ] Instalar Twilio Voice SDK no Lovable
- [ ] Criar endpoint `/token` no backend (gerar token JWT para SDK)
- [ ] Implementar conexão do dispositivo
- [ ] UI de chamada recebendo (popup)
- [ ] Botões: Atender / Rejeitar
- [ ] UI durante chamada:
  - [ ] Timer de duração
  - [ ] Botão Mute/Unmute
  - [ ] Botão Hold
  - [ ] Botão Desligar
- [ ] Input para fazer chamada outbound
- [ ] Status do agente (Available/Busy/Offline)
- [ ] Sincronizar status com TaskRouter

---

## 🔵 FASE 4: Melhorias Futuras (Backlog)

### Funcionalidades Pendentes do Plano Original
- [ ] Whisper (Sussurro) - Mensagem só para o agente
- [ ] AMD (Machine Detection) - Detectar secretária eletrônica
- [ ] Blacklist/Opt-out - Não ligar para quem pediu
- [ ] Transbordo (Queue) - Fila de espera
- [ ] Failover (Siga-me) - Redirecionar se não atender
- [ ] Storage Externo (S3) - Backup das gravações
- [ ] Notificações Desktop - Push notifications

### Infraestrutura
- [ ] Ambiente separado (Subcontas dev/prod)
- [ ] Monitoramento (logs, alertas de erro)
- [ ] Backup automático do banco
- [ ] CI/CD (deploy automático)

---

## 📋 Checklist Rápido

### Antes de ir para Produção
- [ ] Funciona com Flex? ✅
- [ ] Gravações funcionando? ✅
- [ ] Webhooks recebendo dados? ✅
- [ ] Banco salvando chamadas? ✅

### Deploy Railway
- [ ] Conta criada
- [ ] Repo conectado
- [ ] PostgreSQL criado
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy funcionando
- [ ] Webhooks atualizados
- [ ] Teste de chamada OK

### Pós-Produção
- [ ] Números FL/TX comprados
- [ ] Rotação funcionando
- [ ] Dashboard Lovable
- [ ] Softphone Lovable

---

## 🔗 Links Úteis

- [Railway](https://railway.app)
- [Twilio Console](https://console.twilio.com)
- [Twilio Flex](https://flex.twilio.com)
- [Twilio Voice SDK](https://www.twilio.com/docs/voice/sdks/javascript)
- [Lovable](https://lovable.dev)

---

## 📝 Notas

### Variáveis de Ambiente Necessárias (Railway)
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+18336411602
TWILIO_PHONE_NUMBER_FL=+1305...  # após comprar
TWILIO_PHONE_NUMBER_TX=+1713...  # após comprar
DATABASE_URL=postgresql://...
BASE_URL=https://seu-app.up.railway.app
FLASK_ENV=production
SECRET_KEY=...
```

### Comandos Úteis
```bash
# Rodar localmente com Gunicorn (teste antes do deploy)
gunicorn app:app --bind 0.0.0.0:5000

# Ver logs do Railway
railway logs

# Conectar ao banco PostgreSQL
railway connect postgres
```

---

**Última atualização:** 13/Jan/2026
