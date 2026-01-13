# Plano de Desenvolvimento Twilio - Organizado por Complexidade

## Resumo das Tarefas

| # | Tarefa | Complexidade | Dependências |                               
|---|--------|--------------|--------------| 
| 1 | Ambiente Separado (Subcontas) | 🟢 Baixa | - | 
| 2 | Aquisição de DIDs (Números) | 🟢 Baixa | Tarefa 1 |
| 3 | Disclaimer de Gravação | 🟢 Baixa | - | ✅
| 5 | Webhooks de Status | 🟡 Média | Servidor rodando | ✅
| 6 | Whisper (Sussurro) | 🟡 Média | Tarefa 5 |
| 7 | AMD (Machine Detection) | 🟡 Média | - | 
| 8 | Gravação Dual-Channel | 🟡 Média | - | ✅
| 9 | Identidade de Usuário | 🟡 Média | Sistema de login |
| 10 | Roteamento Dedicado | 🟡 Média | Tarefas 2, 9 |
| 11 | Transbordo (Queue) | 🔴 Alta | Tarefas 5, 10 |
| 12 | SSO mobile | 🔴 Alta | Tarefa 10 |
| 13 | Modelagem do Banco | 🟡 Média | - | ✅ 
| 14 | Storage Externo (S3) | 🔴 Alta | AWS configurada |
| 15 | Rotação de Caller ID | 🔴 Alta | Tarefa 2, Trust Hub |
| 16 | Notificações Desktop | 🟡 Média | Frontend |
| 17 | Dashboard de Controle | 🔴 Alta | Tarefas 5, 13 | 
| 18 | Alertas (Slack/WhatsApp) | 🟡 Média | - | ✅





| # | A fazer | Checks |
1 - Hospedagem Railway
2 - SQLite → PostgreSQL
3 - HTTPS próprio (Railway)
4 - debug=False
5 - Gunicorn ao inves de flask
6 - Atualizar BASE_URL no .env (trocar ngrok para url railway)
7 - Atualizar webhooks na Twilio (Apontar para URL do Railway)





┌─────────────────────────────────────────────────────────┐
│  Softphone no Lovable                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. AUTENTICAÇÃO                                        │
│     - Gerar token para o Twilio SDK                     │
│     - Endpoint /token no seu backend                    │
│                                                         │
│  2. CONECTAR DISPOSITIVO                                │
│     - Twilio Voice SDK conecta navegador                │
│     - Pede permissão de microfone                       │
│                                                         │
│  3. RECEBER CHAMADAS (inbound)                          │
│     - device.on('incoming') → mostrar popup             │
│     - Botão "Atender" → call.accept()                   │
│     - Botão "Rejeitar" → call.reject()                  │
│                                                         │
│  4. FAZER CHAMADAS (outbound)                           │
│     - Input de número                                   │
│     - device.connect({ To: numero })                    │
│                                                         │
│  5. CONTROLES DURANTE CHAMADA                           │
│     - Mute/Unmute                                       │
│     - Hold (precisa backend)                            │
│     - Desligar                                          │
│     - Timer de duração                                  │
│                                                         │
│  6. STATUS DO AGENTE                                    │
│     - Available / Busy / Offline                        │
│     - Sincronizar com TaskRouter                        │
│                                                         │
└─────────────────────────────────────────────────────────┘











