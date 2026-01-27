import os
import json
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify, g
from typing import cast
from twilio.twiml.voice_response import VoiceResponse, Dial
from twilio.rest import Client
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from dotenv import load_dotenv
from flasgger import Swagger
from flask_cors import CORS

from core.config import Config
from core.database import db, init_db
from core.phone_utils import get_state_from_phone, get_caller_id_for_number
from core.alerts import init_alerts, get_alert_manager, CallAlert
from core.attio import get_attio_client
from models.call import Call
from auth.routes import auth_bp
from auth.decorators import jwt_required, validate_twilio_signature

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

print("[STARTUP] Creating Flask app...")
app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS for all routes (allows Lovable frontend to access API)
CORS(app)
print("[STARTUP] CORS enabled")

# ============== HEALTH CHECK (registered first!) ==============
@app.route("/health", methods=['GET'])
def health():
    """Health check - always responds even if other services fail"""
    return jsonify({"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}), 200

print("[STARTUP] Health endpoint registered")

# Swagger config with JWT auth
swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'apispec',
            "route": '/apispec.json',
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs/"
}

swagger_template = {
    "swagger": "2.0",
    "info": {
        "title": "Twilio Discador API",
        "description": "API para gerenciamento de chamadas Twilio",
        "version": "1.0.0"
    },
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "Cole APENAS o token JWT (sem 'Bearer')"
        }
    },
    "security": [{"Bearer": []}]
}

swagger = Swagger(app, config=swagger_config, template=swagger_template)

# Initialize database (with error handling)
print("[STARTUP] Initializing database...")
init_db(app)

# Register auth blueprint
app.register_blueprint(auth_bp, url_prefix='/auth')
print("[STARTUP] Auth blueprint registered")

# Twilio client
try:
    client = Client(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN)
    print("[STARTUP] Twilio client initialized")
except Exception as e:
    print(f"[STARTUP ERROR] Twilio client failed: {e}")
    client = None

# Initialize alerts (Slack only)
try:
    init_alerts()
    print("[STARTUP] Alerts initialized")
except Exception as e:
    print(f"[STARTUP ERROR] Alerts failed: {e}")

print("[STARTUP] App initialization complete")


# ============== HELPER FUNCTIONS ==============

def _calculate_contact_tracking(call):
    """
    Calculate contact tracking values for a call.
    Sets: contact_number, contact_number_today, previously_answered, contact_period

    Contact number counts ALL contacts with a lead (both inbound and outbound).
    """
    from core.phone_utils import get_contact_period, get_lead_phone_for_call
    from datetime import date
    from sqlalchemy import or_, and_

    direction = call.direction or 'outbound'
    lead_phone = get_lead_phone_for_call(direction, call.from_number, call.to_number)

    if not lead_phone:
        call.contact_number = 1
        call.contact_number_today = 1
        call.previously_answered = False
        call.contact_period = get_contact_period(call.started_at, call.lead_state)
        return

    # Normaliza o número do lead (últimos 10 dígitos)
    lead_phone_normalized = ''.join(c for c in lead_phone if c.isdigit())[-10:]
    today = date.today()

    # Lista de números Twilio (não devem ser considerados como leads)
    twilio_numbers = [
        Config.TWILIO_NUMBER,
        Config.CALLER_ID_FL,
        Config.CALLER_ID_TX,
        Config.CALLER_ID_DEFAULT
    ]
    twilio_numbers_normalized = [
        ''.join(c for c in n if c.isdigit())[-10:]
        for n in twilio_numbers if n
    ]

    # Se o "lead" é na verdade um número Twilio, não calcular tracking
    if lead_phone_normalized in twilio_numbers_normalized:
        call.contact_number = None
        call.contact_number_today = None
        call.previously_answered = False
        call.contact_period = get_contact_period(call.started_at, call.lead_state)
        return

    # Query ALL previous calls with this lead (both inbound and outbound)
    # - Inbound: lead ligou para nós (from_number = lead)
    # - Outbound: nós ligamos para o lead (to_number = lead)
    query = Call.query.filter(
        and_(
            or_(
                Call.from_number.contains(lead_phone_normalized),
                Call.to_number.contains(lead_phone_normalized)
            ),
            Call.call_sid != call.call_sid  # Exclui a chamada atual
        )
    )

    previous_calls = query.order_by(Call.started_at.asc()).all()

    # Filtra para remover chamadas onde o "lead" é um número Twilio
    # (evita contar chamadas internas/testes)
    filtered_calls = []
    for c in previous_calls:
        # Determina qual é o número do lead nesta chamada
        if c.direction == 'inbound':
            c_lead = ''.join(ch for ch in (c.from_number or '') if ch.isdigit())[-10:]
        else:
            c_lead = ''.join(ch for ch in (c.to_number or '') if ch.isdigit())[-10:]

        # Só conta se o lead não é um número Twilio
        if c_lead and c_lead not in twilio_numbers_normalized:
            filtered_calls.append(c)

    # 1. Contact number (total de contatos com este lead)
    call.contact_number = len(filtered_calls) + 1

    # 2. Contact number today
    today_calls = [c for c in filtered_calls if c.started_at and c.started_at.date() == today]
    call.contact_number_today = len(today_calls) + 1

    # 3. Previously answered (já atendeu alguma vez?)
    call.previously_answered = any(c.disposition == 'answered' for c in filtered_calls)

    # 4. Contact period
    call.contact_period = get_contact_period(call.started_at, call.lead_state)


def _sanitize_disposition(call):
    """
    Sanitize and fix disposition based on call data.

    REGRA CRÍTICA para inbound calls:
    - Se worker_name/worker_email está NULL = NINGUÉM ATENDEU
    - Duration > 0 sem worker = tempo que ficou tocando/na fila, NÃO é "answered"

    Lógica correta:
    1. Se worker atendeu (worker_name tem valor) → answered
    2. Se ninguém atendeu mas tem voicemail recording → voicemail
    3. Se ninguém atendeu e sem voicemail → no-answer
    4. busy, failed, canceled → manter como está
    """
    # Para inbound calls via Lovable: worker_name NULL = ninguém atendeu
    if call.direction == 'inbound' and not call.worker_name and not call.worker_email:
        # NINGUÉM ATENDEU esta chamada inbound
        if call.disposition == 'answered':
            # ERRO: marcada como answered mas worker é NULL
            if call.recording_url and 'voicemail' in call.recording_url.lower():
                call.disposition = 'voicemail'
                print(f"[SANITIZE] Fixed: inbound 'answered' with NULL worker + voicemail → voicemail")
            else:
                call.disposition = 'no-answer'
                call.answered_at = None  # Remove answered_at incorreto
                print(f"[SANITIZE] Fixed: inbound 'answered' with NULL worker → no-answer")
            return
        elif call.disposition in ('voicemail', 'no-answer', 'busy', 'failed', 'canceled'):
            # Já está correto
            return
        elif call.disposition is None or call.disposition == '':
            # NULL disposition em inbound sem worker
            call.disposition = 'no-answer'
            call.answered_at = None
            print(f"[SANITIZE] Fixed: inbound NULL disposition with NULL worker → no-answer")
            return

    # Para outbound calls ou inbound com worker: lógica antiga
    valid_dispositions = ('answered', 'voicemail', 'busy', 'failed', 'canceled')
    if call.disposition in valid_dispositions:
        # Não mexe se já tem disposition válida
        return

    if call.disposition == 'no-answer':
        # no-answer pode estar correto, não mexe
        return

    # Disposition é NULL ou inválido - determinar baseado na duração
    if call.duration and call.duration > 0:
        # Teve duração > 0, provavelmente foi atendida (só para outbound)
        if call.direction == 'outbound':
            call.disposition = 'answered'
            if not call.answered_at and call.started_at:
                call.answered_at = call.started_at
            print(f"[SANITIZE] Fixed NULL disposition (outbound) with duration {call.duration}s → answered")
        else:
            # Inbound com duration mas sem worker já foi tratado acima
            call.disposition = 'no-answer'
            print(f"[SANITIZE] Fixed NULL disposition (inbound, no worker) with duration {call.duration}s → no-answer")
    else:
        # Duração 0 ou NULL, não foi atendida
        call.disposition = 'no-answer'
        print(f"[SANITIZE] Fixed NULL disposition with no duration → no-answer")


def _calculate_duration(call):
    """
    Calculate call duration based on timestamps.
    For answered calls: ended_at - answered_at (talk time)
    For unanswered calls: ended_at - started_at (total time)
    Returns 0 if timestamps are missing or result is negative.
    """
    if not call.ended_at:
        return 0

    if call.answered_at:
        # Answered call: duration = talk time
        duration = int((call.ended_at - call.answered_at).total_seconds())
    elif call.started_at:
        # Unanswered call: duration = total time
        duration = int((call.ended_at - call.started_at).total_seconds())
    else:
        return 0

    # Never return negative values
    return max(duration, 0)


# ============== TWILIO WEBHOOKS (with signature validation) ==============

@app.route("/voice", methods=['POST'])
@validate_twilio_signature
def voice():
    """
    Handle voice calls:
    - Outbound from browser (Lovable): Dial to the destination number
    - Inbound to Twilio number: Play disclaimer and enqueue
    """
    call_sid = request.form.get('CallSid', '')
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')

    # Check if this is an outbound call from browser (client:identity)
    # Browser calls have From starting with "client:"
    is_browser_call = from_number.startswith('client:')

    response = VoiceResponse()

    if is_browser_call:
        # ========== OUTBOUND CALL FROM BROWSER ==========
        print(f"[BROWSER CALL] From: {from_number}, To: {to_number}")

        # Get the destination number and worker info from params
        dest_number = request.form.get('To', '')
        worker_email = request.form.get('workerEmail', '')
        worker_name = request.form.get('workerName', '')

        if dest_number and dest_number.startswith('+'):
            # Select Caller ID based on destination state
            caller_id = get_caller_id_for_number(dest_number)
            lead_state = get_state_from_phone(dest_number)

            print(f"[BROWSER CALL] Dialing {dest_number} with Caller ID {caller_id} (State: {lead_state}) - Worker: {worker_email}")

            # Save call to database
            existing_call = Call.query.filter_by(call_sid=call_sid).first()
            if not existing_call:
                call = Call(
                    call_sid=call_sid,
                    from_number=caller_id,
                    to_number=dest_number,
                    lead_state=lead_state,
                    direction='outbound',
                    worker_email=worker_email,
                    worker_name=worker_name,
                    started_at=datetime.now(timezone.utc)
                )
                db.session.add(call)
                _calculate_contact_tracking(call)
                db.session.commit()

            # Dial the destination number with AMD (Answering Machine Detection)
            dial = cast(Dial, response.dial(
                caller_id=caller_id,
                record='record-from-answer-dual',
                recording_status_callback=f"{Config.BASE_URL}/recording_status",
                recording_status_callback_event='completed'
            ))
            dial.number(
                dest_number,
                status_callback=f"{Config.BASE_URL}/call_status",
                status_callback_event='initiated ringing answered completed',
                machine_detection='DetectMessageEnd',
                machine_detection_timeout=30,
                amd_status_callback=f"{Config.BASE_URL}/amd_callback",
                amd_status_callback_method='POST'
            )
        else:
            response.say("Invalid destination number.", language='en-US', voice='Polly.Joanna')
            response.hangup()
    else:
        # ========== INBOUND CALL ==========
        direction = request.form.get('Direction', 'inbound')

        # Save call to database
        existing_call = Call.query.filter_by(call_sid=call_sid).first()
        if not existing_call:
            lead_state = get_state_from_phone(from_number)
            caller_city = request.form.get('FromCity', '')
            call = Call(
                call_sid=call_sid,
                from_number=from_number,
                to_number=to_number,
                lead_state=lead_state,
                direction=direction,
                caller_city=caller_city,
                started_at=datetime.now(timezone.utc)
            )
            db.session.add(call)
            _calculate_contact_tracking(call)
            db.session.commit()
            print(f"[INBOUND] New call {call_sid} from {from_number} ({caller_city}) - State: {lead_state}")

            # Send "Incoming Call" alert
            alert_manager = get_alert_manager()
            if alert_manager:
                alert = CallAlert(
                    call_sid=call_sid,
                    from_number=from_number,
                    to_number=to_number,
                    status='ringing',
                    duration=0,
                    lead_state=lead_state,
                    direction='inbound',
                    caller_city=caller_city
                )
                alert_manager.notify_call_status(alert)

        response.say(
            "This call is being recorded for your security and quality assurance.",
            language='en-US',
            voice='Polly.Joanna'
        )

        # Verifica se deve usar Lovable ou Flex para inbound
        use_lovable = Config.INBOUND_USE_LOVABLE

        if use_lovable:
            # ===== LOVABLE: Dial para todos os SDRs conectados =====
            from models.user import User

            # Busca todos os usuários ativos
            active_users = User.query.filter_by(is_active=True).all()

            # Gera identidades dos clientes (mesmo formato do /token)
            client_identities = []
            for user in active_users:
                identity = ''.join(c for c in user.email if c.isalnum() or c in '_-')
                client_identities.append(identity)

            print(f"[INBOUND] Dialing to Lovable clients: {client_identities}")

            # Dial para todos os clientes - primeiro a atender ganha
            dial = cast(Dial, response.dial(
                timeout=30,
                action=f"{Config.BASE_URL}/inbound_status",
                record='record-from-answer-dual',
                recording_status_callback=f"{Config.BASE_URL}/recording_status",
                recording_status_callback_event='completed'
            ))

            for identity in client_identities:
                # Pass parent call SID so client can use it for hold
                client_elem = dial.client(identity)
                if client_elem is not None:
                    client_elem.parameter(name='ParentCallSid', value=call_sid)  # type: ignore[union-attr]

        else:
            # ===== FLEX: Enqueue para TaskRouter =====
            response.enqueue(
                None,
                workflow_sid=Config.TWILIO_WORKFLOW_SID,
                wait_url=f"{Config.BASE_URL}/wait"
            )

    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/wait", methods=['POST'])
@validate_twilio_signature
def wait():
    """Musica/mensagem enquanto aguarda na fila"""
    response = VoiceResponse()
    response.say(
        "Please hold while we connect you to an agent.",
        language='en-US',
        voice='Polly.Joanna'
    )
    response.play("https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3", loop=0)
    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/amd_callback", methods=['POST'])
def amd_callback():
    """
    Callback dedicado para AMD (Answering Machine Detection).
    Recebe o resultado do AMD e atualiza a chamada.
    """
    call_sid = request.form.get('CallSid', '')
    parent_call_sid = request.form.get('ParentCallSid', '')
    answered_by = request.form.get('AnsweredBy', '')
    machine_detection_duration = request.form.get('MachineDetectionDuration', '0')

    print(f"[AMD CALLBACK] CallSid={call_sid}, ParentSid={parent_call_sid}, AnsweredBy={answered_by}, Duration={machine_detection_duration}ms")

    # Usa o ParentCallSid para encontrar a chamada pai (outbound)
    target_call_sid = parent_call_sid if parent_call_sid else call_sid

    call = Call.query.filter_by(call_sid=target_call_sid).first()
    if not call:
        print(f"[AMD CALLBACK] Call {target_call_sid} not found")
        return '', 204

    # Tipos de máquina/voicemail
    machine_types = ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax']

    if answered_by in machine_types:
        call.disposition = 'voicemail'
        db.session.commit()
        print(f"[AMD CALLBACK] Call {target_call_sid} marked as voicemail (AnsweredBy: {answered_by})")
    elif answered_by == 'human':
        print(f"[AMD CALLBACK] Call {target_call_sid} - Human detected, no action needed")
    else:
        print(f"[AMD CALLBACK] Call {target_call_sid} - Unknown AnsweredBy: {answered_by}")

    return '', 204


@app.route("/hold_music", methods=['GET', 'POST'])
def hold_music():
    """TwiML que toca música de espera em loop"""
    response = VoiceResponse()
    response.say(
        "Please hold, your call is important to us.",
        language='en-US',
        voice='Polly.Joanna'
    )
    # Música de espera - usando URL HTTPS confiável do Twilio
    # Loop infinito (loop=0) para manter tocando até unhold
    response.play("https://api.twilio.com/cowbell.mp3", loop=0)
    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/hold", methods=['POST'])
@jwt_required
def hold_call():
    """
    Coloca uma chamada em espera (hold) - toca música para o lead.
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    parameters:
      - name: body
        in: body
        schema:
          properties:
            call_sid:
              type: string
              description: SID da chamada (perna do lead, não do agente)
    responses:
      200:
        description: Chamada colocada em hold
      400:
        description: call_sid não fornecido
      500:
        description: Erro ao colocar em hold
    """
    data = request.get_json() or {}
    call_sid = data.get('call_sid')

    if not call_sid:
        return jsonify({"error": "call_sid is required"}), 400

    if client is None:
        return jsonify({"error": "Twilio client not initialized"}), 500

    try:
        # Primeiro verifica se a chamada ainda está ativa
        call_info = client.calls(call_sid).fetch()

        if call_info.status not in ('in-progress', 'ringing'):
            print(f"[HOLD] Call {call_sid} is not active (status: {call_info.status})")
            return jsonify({
                "error": "Call is not active",
                "call_status": call_info.status,
                "message": "Cannot put a completed call on hold"
            }), 400

        # Usa BASE_URL ou constrói a partir da request
        base_url = Config.BASE_URL or request.host_url.rstrip('/')
        hold_url = f"{base_url}/hold_music"
        print(f"[HOLD] Redirecting call {call_sid} to {hold_url}")

        # Redireciona a chamada do lead para tocar música de espera
        call = client.calls(call_sid).update(
            url=hold_url,
            method='POST'
        )
        print(f"[HOLD] Call {call_sid} placed on hold successfully")
        return jsonify({"success": True, "message": "Call placed on hold", "call_sid": call_sid})
    except Exception as e:
        print(f"[HOLD ERROR] {e}")
        # Verifica se é erro de chamada não encontrada ou já finalizada
        error_msg = str(e).lower()
        if 'not found' in error_msg or 'completed' in error_msg or 'canceled' in error_msg:
            return jsonify({
                "error": "Call is no longer active",
                "message": "The call has already ended"
            }), 400
        return jsonify({"error": str(e)}), 500


@app.route("/unhold", methods=['POST'])
@jwt_required
def unhold_call():
    """
    Retira uma chamada da espera - reconecta com o agente.
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    parameters:
      - name: body
        in: body
        schema:
          properties:
            call_sid:
              type: string
              description: SID da chamada do lead
            agent_identity:
              type: string
              description: Identidade do agente para reconectar
    responses:
      200:
        description: Chamada retirada do hold
      400:
        description: Parâmetros faltando
      500:
        description: Erro ao retirar do hold
    """
    data = request.get_json() or {}
    call_sid = data.get('call_sid')
    agent_identity = data.get('agent_identity')

    if not call_sid or not agent_identity:
        return jsonify({"error": "call_sid and agent_identity are required"}), 400

    if client is None:
        return jsonify({"error": "Twilio client not initialized"}), 500

    try:
        # Primeiro verifica se a chamada ainda está ativa
        call_info = client.calls(call_sid).fetch()

        if call_info.status not in ('in-progress', 'ringing'):
            print(f"[UNHOLD] Call {call_sid} is not active (status: {call_info.status})")
            return jsonify({
                "error": "Call is not active",
                "call_status": call_info.status,
                "message": "Cannot resume a completed call"
            }), 400

        # Redireciona a chamada de volta para o agente
        # Cria TwiML para conectar de volta
        call = client.calls(call_sid).update(
            twiml=f'<Response><Dial><Client>{agent_identity}</Client></Dial></Response>'
        )
        print(f"[UNHOLD] Call {call_sid} reconnected to {agent_identity}")
        return jsonify({"success": True, "message": "Call resumed", "call_sid": call_sid})
    except Exception as e:
        print(f"[UNHOLD ERROR] {e}")
        # Verifica se é erro de chamada não encontrada ou já finalizada
        error_msg = str(e).lower()
        if 'not found' in error_msg or 'completed' in error_msg or 'canceled' in error_msg:
            return jsonify({
                "error": "Call is no longer active",
                "message": "The call has already ended"
            }), 400
        return jsonify({"error": str(e)}), 500


@app.route("/inbound_status", methods=['POST'])
@validate_twilio_signature
def inbound_status():
    """
    Callback quando o Dial para clientes Lovable completa.
    Atualiza o banco com quem atendeu a chamada.
    """
    call_sid = request.form.get('CallSid', '')
    dial_call_status = request.form.get('DialCallStatus', '')  # completed, no-answer, busy, failed, canceled
    dial_call_sid = request.form.get('DialCallSid', '')  # SID da perna que atendeu
    called_via = request.form.get('Called', '')  # client:identity que atendeu
    dial_bridge_target = request.form.get('DialBridged', '')  # Who answered (for simultaneous dial)

    # Log all form data for debugging
    print(f"[INBOUND STATUS] CallSid={call_sid}, DialStatus={dial_call_status}, CalledVia={called_via}, DialBridged={dial_bridge_target}")
    print(f"[INBOUND STATUS] All form data: {dict(request.form)}")

    response = VoiceResponse()

    # Busca a chamada no banco
    call = Call.query.filter_by(call_sid=call_sid).first()
    print(f"[INBOUND STATUS] Call found in DB: {call is not None}")

    if dial_call_status == 'completed' or dial_call_status == 'answered':
        # Dial completou - mas alguém realmente atendeu?
        print(f"[INBOUND STATUS] Dial completed/answered - call found: {call is not None}")
        if call:
            worker_found = False

            # Extrai a identidade do cliente que atendeu
            print(f"[INBOUND STATUS] Called field: '{called_via}' - starts with 'client:': {called_via.startswith('client:') if called_via else False}")

            if called_via and called_via.startswith('client:'):
                client_identity = called_via.replace('client:', '')
                print(f"[INBOUND STATUS] Looking for client identity: '{client_identity}'")

                # Tenta encontrar o usuário pelo identity
                from models.user import User
                active_users = User.query.filter_by(is_active=True).all()
                print(f"[INBOUND STATUS] Found {len(active_users)} active users")

                for user in active_users:
                    user_identity = ''.join(c for c in user.email if c.isalnum() or c in '_-')
                    print(f"[INBOUND STATUS] Comparing '{client_identity}' with '{user_identity}' ({user.email})")
                    if user_identity == client_identity:
                        call.worker_email = user.email
                        call.worker_name = user.name or user.email.split('@')[0].capitalize()
                        call.answered_at = datetime.now(timezone.utc)
                        call.disposition = 'answered'
                        worker_found = True
                        print(f"[INBOUND STATUS] ✓ Call answered by {call.worker_name} ({call.worker_email})")
                        break

                if not worker_found:
                    print(f"[INBOUND STATUS] ✗ No matching user found for identity '{client_identity}' - NOT marking as answered")
                    call.disposition = 'no-answer'
            else:
                print(f"[INBOUND STATUS] ✗ Called field doesn't start with 'client:' - marking as no-answer")
                call.disposition = 'no-answer'

            db.session.commit()

            # Send "Call Answered by Agent" alert (ONLY if worker was identified)
            alert_manager = get_alert_manager()
            if alert_manager and worker_found and call.worker_name:
                alert = CallAlert(
                    call_sid=call_sid,
                    from_number=call.from_number,
                    to_number=call.to_number,
                    status='in-progress',
                    duration=0,
                    disposition='answered',
                    lead_state=call.lead_state,
                    recording_url=None,
                    direction='inbound',
                    worker_name=call.worker_name,
                    caller_city=call.caller_city
                )
                alert_manager.notify_call_status(alert)

    elif dial_call_status == 'no-answer':
        # Ninguém atendeu - deixa mensagem
        if call:
            call.disposition = 'no-answer'
            db.session.commit()

        response.say(
            "We're sorry, no one is available to take your call. Please leave a message after the beep.",
            language='en-US',
            voice='Polly.Joanna'
        )
        response.record(
            max_length=120,
            action=f"{Config.BASE_URL}/voicemail_recorded",
            recording_status_callback=f"{Config.BASE_URL}/recording_status"
        )

    elif dial_call_status in ('busy', 'failed', 'canceled'):
        if call:
            call.disposition = dial_call_status
            db.session.commit()

        response.say(
            "We're sorry, we couldn't connect your call. Please try again later.",
            language='en-US',
            voice='Polly.Joanna'
        )
        response.hangup()
    else:
        print(f"[INBOUND STATUS] ⚠️ Unexpected DialCallStatus: '{dial_call_status}'")

    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/voicemail_recorded", methods=['POST'])
@validate_twilio_signature
def voicemail_recorded():
    """Callback quando o cliente deixa uma mensagem de voz"""
    call_sid = request.form.get('CallSid', '')
    recording_url = request.form.get('RecordingUrl', '')

    print(f"[VOICEMAIL] Recorded for {call_sid}: {recording_url}")

    # Atualiza o banco
    call = Call.query.filter_by(call_sid=call_sid).first()
    if call:
        call.disposition = 'voicemail'
        if recording_url:
            call.recording_url = recording_url
        db.session.commit()

    response = VoiceResponse()
    response.say("Thank you for your message. Goodbye.", language='en-US', voice='Polly.Joanna')
    response.hangup()

    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/assignment", methods=['POST'])
@validate_twilio_signature
def assignment():
    """Callback do TaskRouter - aceita a tarefa sem instrução específica"""
    print(f"[ASSIGNMENT] Task assignment callback received")

    # Retorna accept para deixar o Flex gerenciar o fluxo da chamada
    return jsonify({"accept": True})


@app.route("/taskrouter_event", methods=['POST'])
@validate_twilio_signature
def taskrouter_event():
    """Callback para eventos do TaskRouter (task.created, task.updated, reservation.accepted, etc)"""
    event_type = request.form.get('EventType', '')
    task_attributes = request.form.get('TaskAttributes', '{}')
    task_sid = request.form.get('TaskSid', '')
    worker_name = request.form.get('WorkerName', '')

    print(f"[TASKROUTER EVENT] {event_type} - TaskSid: {task_sid} - Worker: {worker_name}")
    print(f"[TASKROUTER ATTRS] {task_attributes}")

    try:
        attrs = json.loads(task_attributes)
    except:
        attrs = {}

    # Helper para extrair call_sid do customer nas conferences
    def get_customer_call_sid(attributes):
        """Extrai o call_sid do customer de conference.participants"""
        conference = attributes.get('conference', {})
        participants = conference.get('participants', {})
        customer = participants.get('customer', '')
        # customer pode ser o call_sid direto ou um objeto
        if isinstance(customer, str) and customer.startswith('CA'):
            return customer
        elif isinstance(customer, dict):
            return customer.get('call_sid', '')
        return ''

    # Quando uma task é criada (captura chamadas outbound do Flex)
    if event_type == 'task.created':
        direction = attrs.get('direction', '')
        from_number = attrs.get('from', '')
        to_number = attrs.get('outbound_to', '') or attrs.get('to', '')
        call_sid = attrs.get('call_sid', '') or get_customer_call_sid(attrs)

        print(f"[TASK CREATED] TaskSid={task_sid}, CallSid={call_sid}, Direction={direction}, From={from_number}, To={to_number}")

        if direction == 'outbound' and to_number:
            # Usa task_sid como identificador se call_sid ainda não existe
            identifier = call_sid if call_sid else f"TASK:{task_sid}"

            existing_call = Call.query.filter_by(call_sid=identifier).first()
            if not existing_call:
                lead_state = get_state_from_phone(to_number)
                call = Call(
                    call_sid=identifier,
                    from_number=from_number,
                    to_number=to_number,
                    lead_state=lead_state,
                    direction='outbound',
                    started_at=datetime.now(timezone.utc)
                )
                db.session.add(call)
                db.session.commit()
                print(f"[OUTBOUND] Saved call {identifier} to database - To: {to_number}, State: {lead_state}")

                # Send alert for outbound call initiated
                alert_manager = get_alert_manager()
                if alert_manager:
                    alert = CallAlert(
                        call_sid=identifier,
                        from_number=from_number,
                        to_number=to_number,
                        status='initiated',
                        duration=0,
                        lead_state=lead_state,
                        direction='outbound'
                    )
                    alert_manager.notify_call_status(alert)

    # Quando a task é atualizada (pode conter o call_sid real)
    elif event_type == 'task.updated':
        call_sid = attrs.get('call_sid', '') or get_customer_call_sid(attrs)

        print(f"[TASK UPDATED] TaskSid={task_sid}, CallSid={call_sid}")

        if call_sid and task_sid:
            # Busca pelo task_sid temporário e atualiza com o call_sid real
            temp_identifier = f"TASK:{task_sid}"
            call = Call.query.filter_by(call_sid=temp_identifier).first()
            if call:
                call.call_sid = call_sid
                db.session.commit()
                print(f"[OUTBOUND] Updated call_sid from {temp_identifier} to {call_sid}")

    # Quando o agente aceita a reserva (chamada atendida)
    elif event_type == 'reservation.accepted':
        call_sid = attrs.get('call_sid', '') or get_customer_call_sid(attrs)
        direction = attrs.get('direction', '')

        print(f"[RESERVATION ACCEPTED] Agent {worker_name} answered - TaskSid={task_sid}, CallSid={call_sid}")

        # Tenta encontrar a chamada pelo call_sid ou pelo task_sid temporário
        call = None
        if call_sid:
            call = Call.query.filter_by(call_sid=call_sid).first()
        if not call and task_sid:
            call = Call.query.filter_by(call_sid=f"TASK:{task_sid}").first()
            if call and call_sid:
                # Atualiza com o call_sid real
                call.call_sid = call_sid
                print(f"[OUTBOUND] Updated call_sid to {call_sid}")

        if call_sid:
            # Start recording when call is answered
            if client is not None:
                try:
                    client.calls(call_sid).recordings.create(
                        recording_channels='dual',
                        recording_status_callback=f"{Config.BASE_URL}/recording_status",
                        recording_status_callback_event=['completed']
                    )
                    print(f"[RECORDING] Started recording for call {call_sid}")
                except Exception as e:
                    print(f"[RECORDING ERROR] Failed to start recording for {call_sid}: {e}")
            else:
                print(f"[RECORDING ERROR] Twilio client is not initialized. Cannot start recording for {call_sid}")

        if call:
            call.answered_at = datetime.now(timezone.utc)
            call.disposition = 'answered'
            call.worker_name = worker_name
            # Calculate queue_time (time from started_at to answered_at)
            if call.started_at:
                queue_seconds = (call.answered_at - call.started_at).total_seconds()
                call.queue_time = int(queue_seconds)
            db.session.commit()

            # Send "Call Answered" alert
            alert_manager = get_alert_manager()
            if alert_manager:
                alert = CallAlert(
                    call_sid=call.call_sid,
                    from_number=call.from_number,
                    to_number=call.to_number,
                    status='in-progress',
                    duration=0,
                    lead_state=call.lead_state,
                    direction=call.direction or 'inbound',
                    worker_name=worker_name,
                    caller_city=call.caller_city
                )
                alert_manager.notify_call_status(alert)

    # Quando a task é completada (chamada encerrada)
    elif event_type == 'task.completed':
        call_sid = attrs.get('call_sid', '') or get_customer_call_sid(attrs)

        # Tenta encontrar pelo call_sid ou task_sid
        call = None
        if call_sid:
            call = Call.query.filter_by(call_sid=call_sid).first()
        if not call and task_sid:
            call = Call.query.filter_by(call_sid=f"TASK:{task_sid}").first()

        if call and not call.ended_at:
            call.ended_at = datetime.now(timezone.utc)
            if not call.disposition:
                call.disposition = 'completed'
            # Calculate duration if not already set
            if not call.duration or call.duration == 0:
                call.duration = _calculate_duration(call)
            db.session.commit()
            print(f"[TASK COMPLETED] Call {call.call_sid} marked as completed - Duration: {call.duration}s")

    return '', 204


@app.route("/call_status", methods=['POST'])
@validate_twilio_signature
def call_status():
    """
    Recebe atualizacoes de status da chamada e salva no banco.
    Eventos: initiated, ringing, in-progress, completed, busy, no-answer, canceled, failed
    """
    call_sid = request.form.get('CallSid', '')
    parent_call_sid = request.form.get('ParentCallSid', '')  # SID da chamada pai (para outbound-dial)
    status = request.form.get('CallStatus', '')
    duration = request.form.get('CallDuration', '0')
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', '')
    answered_by = request.form.get('AnsweredBy', '')  # AMD result

    # Debug: log all incoming webhook data
    print(f"[WEBHOOK DEBUG] CallSid={call_sid}, ParentSid={parent_call_sid}, Status={status}, Direction={direction}, AnsweredBy={answered_by}")

    if not call_sid:
        return '', 400

    # Para chamadas outbound-dial (perna do lead), atualiza a chamada pai
    # Não cria registro novo para evitar duplicatas
    if direction == 'outbound-dial' and parent_call_sid:
        call = Call.query.filter_by(call_sid=parent_call_sid).first()
        if call:
            print(f"[WEBHOOK] Updating parent call {parent_call_sid} with child status: {status}, AnsweredBy: {answered_by}")
        else:
            # Se não encontrar o pai, ignora (não cria duplicata)
            print(f"[WEBHOOK] Parent call {parent_call_sid} not found, ignoring outbound-dial status")
            return '', 204
    else:
        # Busca ou cria registro da chamada
        call = Call.query.filter_by(call_sid=call_sid).first()

        if not call:
            # Não cria registros para outbound-dial sem pai
            if direction == 'outbound-dial':
                print(f"[WEBHOOK] Ignoring orphan outbound-dial call {call_sid}")
                return '', 204

            # Determina o número do lead (depende da direção)
            lead_number = from_number if direction == 'inbound' else to_number
            lead_state = get_state_from_phone(lead_number)
            caller_city = request.form.get('FromCity', '') if direction == 'inbound' else ''

            call = Call(
                call_sid=call_sid,
                from_number=from_number,
                to_number=to_number,
                lead_state=lead_state,
                direction=direction,
                caller_city=caller_city,
                started_at=datetime.now(timezone.utc)
            )
            db.session.add(call)
            _calculate_contact_tracking(call)

    # AMD Detection: Se detectou máquina/voicemail, marca como voicemail
    machine_types = ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax']
    if answered_by in machine_types:
        call.disposition = 'voicemail'
        print(f"[AMD] Call {call_sid}: Detected {answered_by} - setting disposition to voicemail")
    elif answered_by == 'human':
        print(f"[AMD] Call {call_sid}: Human detected")

    # Atualiza campos baseado no status
    twilio_duration = int(duration) if duration else 0

    # in-progress = chamada foi atendida (para outbound, significa que o lead atendeu)
    if status == 'in-progress':
        if not call.answered_at:
            call.answered_at = datetime.now(timezone.utc)
            print(f"[STATUS] Call {call_sid} answered at {call.answered_at}")
            # Calculate queue_time for outbound (time from started_at to answered_at)
            if call.started_at:
                queue_seconds = (call.answered_at - call.started_at).total_seconds()
                call.queue_time = int(queue_seconds)
        db.session.commit()
        return '', 204

    if status == 'completed':
        call.ended_at = datetime.now(timezone.utc)

        # Calculate duration first (needed for voicemail detection)
        if call.answered_at:
            # Duration = tempo de conversa (ended_at - answered_at)
            calculated_duration = int((call.ended_at - call.answered_at).total_seconds())
        elif call.started_at:
            # Duration = tempo total (ended_at - started_at)
            calculated_duration = int((call.ended_at - call.started_at).total_seconds())
        else:
            calculated_duration = 0

        # Use o maior valor entre calculado e Twilio (fallback)
        call.duration = max(calculated_duration, twilio_duration, 0)

        # Não sobrescrever disposition se já foi setado pelo AMD (voicemail, etc)
        if call.disposition not in ('voicemail', 'busy', 'failed', 'canceled'):
            if call.answered_at:
                # Fallback: chamadas outbound muito curtas (< 15s) são provavelmente voicemail
                # AMD não funciona bem para números internacionais
                if call.direction == 'outbound' and call.duration < 15:
                    call.disposition = 'voicemail'
                    print(f"[VOICEMAIL FALLBACK] Call {call_sid}: Short duration ({call.duration}s) - likely voicemail")
                else:
                    call.disposition = 'answered'
            else:
                call.disposition = 'no-answer'
    elif status == 'busy':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'busy'
        call.duration = _calculate_duration(call)
    elif status == 'no-answer':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'no-answer'
        call.duration = _calculate_duration(call)
    elif status == 'failed':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'failed'
        call.duration = _calculate_duration(call)
    elif status == 'canceled':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'canceled'
        call.duration = _calculate_duration(call)

    # Sanitiza disposition para corrigir inconsistências
    _sanitize_disposition(call)

    db.session.commit()

    print(f"[STATUS] Call {call_sid}: {status} | Disposition: {call.disposition} | Duration: {call.duration}s (Twilio sent: {twilio_duration}s)")

    # Send alerts for status changes (only for terminal statuses)
    alert_manager = get_alert_manager()
    if alert_manager and status in ('completed', 'busy', 'no-answer', 'failed', 'canceled'):
        # Use disposition for alert status
        alert_status = call.disposition or status
        alert = CallAlert(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
            status=alert_status,
            duration=call.duration or 0,
            disposition=call.disposition,
            lead_state=call.lead_state,
            recording_url=call.recording_url,
            direction=call.direction or direction,
            worker_name=call.worker_name,
            caller_city=call.caller_city
        )
        alert_manager.notify_call_status(alert)

    return '', 204


@app.route("/recording_status", methods=['POST'])
@validate_twilio_signature
def recording_status():
    """
    Recebe callback quando gravacao esta pronta.
    Salva a URL da gravacao no banco.
    """
    call_sid = request.form.get('CallSid', '')
    recording_sid = request.form.get('RecordingSid', '')
    recording_url = request.form.get('RecordingUrl', '')
    rec_status = request.form.get('RecordingStatus', '')

    if rec_status == 'completed' and recording_url:
        call = Call.query.filter_by(call_sid=call_sid).first()
        if call:
            # URL com formato .mp3 para facilitar reprodução
            call.recording_url = f"{recording_url}.mp3"
            call.recording_sid = recording_sid
            db.session.commit()
            print(f"[RECORDING] Call {call_sid}: Recording saved - {recording_url}.mp3")

            # Send recording alert
            alert_manager = get_alert_manager()
            if alert_manager:
                alert = CallAlert(
                    call_sid=call_sid,
                    from_number=call.from_number,
                    to_number=call.to_number,
                    status=call.disposition or 'completed',
                    duration=call.duration or 0,
                    disposition=call.disposition,
                    lead_state=call.lead_state,
                    recording_url=call.recording_url,
                    direction=call.direction or '',
                    worker_name=call.worker_name,
                    caller_city=call.caller_city
                )
                alert_manager.notify_recording_ready(alert)
        else:
            print(f"[RECORDING] Call {call_sid} not found in database")
    else:
        print(f"[RECORDING] Call {call_sid}: Status {rec_status}")

    return '', 204


@app.route("/recording/<recording_sid>", methods=['GET'])
@jwt_required
def get_recording(recording_sid):
    """
    Proxy para acessar gravações do Twilio sem expor credenciais.
    Busca a gravação no Twilio e retorna o áudio.
    """
    import requests

    if not recording_sid:
        return jsonify({"error": "Missing recording_sid"}), 400

    try:
        # URL da gravação no Twilio
        recording_url = f"https://api.twilio.com/2010-04-01/Accounts/{Config.TWILIO_ACCOUNT_SID}/Recordings/{recording_sid}.mp3"

        # Busca com autenticação
        response = requests.get(
            recording_url,
            auth=(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN),
            stream=True
        )

        if response.status_code == 200:
            from flask import Response
            return Response(
                response.iter_content(chunk_size=8192),
                content_type='audio/mpeg',
                headers={
                    'Content-Disposition': f'inline; filename="{recording_sid}.mp3"'
                }
            )
        else:
            print(f"[RECORDING PROXY] Failed to fetch {recording_sid}: {response.status_code}")
            return jsonify({"error": "Recording not found"}), 404

    except Exception as e:
        print(f"[RECORDING PROXY ERROR] {e}")
        return jsonify({"error": str(e)}), 500


# ============== AMD (Answering Machine Detection) ==============

@app.route("/outbound_connect", methods=['POST'])
@validate_twilio_signature
def outbound_connect():
    """
    TwiML inicial para chamadas outbound.
    Se AMD estiver habilitado, a chamada aguarda a detecção.
    Se humano atender, conecta ao agente via enqueue.
    """
    response = VoiceResponse()

    # Se AMD não estiver habilitado, conecta direto ao fluxo normal
    if not Config.AMD_ENABLED:
        response.say(
            "This call is being recorded for your security and quality assurance.",
            language='en-US',
            voice='Polly.Joanna'
        )
        response.enqueue(
            None,
            workflow_sid=Config.TWILIO_WORKFLOW_SID,
            wait_url=f"{Config.BASE_URL}/wait"
        )
    else:
        # Com AMD: apenas um silêncio breve enquanto a detecção acontece
        # O /amd_status vai redirecionar a chamada baseado no resultado
        response.pause(length=1)
        response.say(
            "This call is being recorded for your security and quality assurance.",
            language='en-US',
            voice='Polly.Joanna'
        )
        response.enqueue(
            None,
            workflow_sid=Config.TWILIO_WORKFLOW_SID,
            wait_url=f"{Config.BASE_URL}/wait"
        )

    return str(response), 200, {'Content-Type': 'application/xml'}


@app.route("/amd_status", methods=['POST'])
@validate_twilio_signature
def handle_amd_status():
    """
    Callback do AMD (Answering Machine Detection).
    Quando detecta caixa postal: deixa mensagem e desliga.
    Quando detecta humano: deixa a chamada continuar normalmente.
    """
    call_sid = request.form.get('CallSid', '')
    answered_by = request.form.get('AnsweredBy', '')
    machine_detection_duration = request.form.get('MachineDetectionDuration', '0')

    print(f"[AMD] CallSid={call_sid}, AnsweredBy={answered_by}, Duration={machine_detection_duration}ms")

    # Valores possíveis de AnsweredBy:
    # - human: Humano atendeu
    # - machine_start: Máquina detectada (início da mensagem)
    # - machine_end_beep: Máquina detectada (após o beep - pronto para gravar)
    # - machine_end_silence: Máquina detectada (silêncio após mensagem)
    # - machine_end_other: Máquina detectada (outro)
    # - fax: Fax detectado
    # - unknown: Não conseguiu determinar

    is_machine = answered_by in ('machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other')

    if is_machine and call_sid:
        print(f"[AMD] Voicemail detected for {call_sid} - Leaving message and hanging up")

        # Atualiza o banco com disposition 'voicemail'
        call = Call.query.filter_by(call_sid=call_sid).first()
        if call:
            call.disposition = 'voicemail'
            db.session.commit()
            print(f"[AMD] Updated call {call_sid} disposition to 'voicemail'")

        # Redireciona a chamada para deixar mensagem e desligar
        if client is not None:
            try:
                client.calls(call_sid).update(
                    url=f"{Config.BASE_URL}/voicemail_message",
                    method='POST'
                )
                print(f"[AMD] Redirected call {call_sid} to voicemail message")
            except Exception as e:
                print(f"[AMD ERROR] Failed to redirect call {call_sid}: {e}")
    else:
        print(f"[AMD] Human detected for {call_sid} - Call continues normally")

    return '', 204


@app.route("/voicemail_message", methods=['POST'])
@validate_twilio_signature
def voicemail_message():
    """
    TwiML para deixar mensagem na caixa postal e desligar.
    """
    call_sid = request.form.get('CallSid', '')
    print(f"[VOICEMAIL] Playing message for call {call_sid}")

    response = VoiceResponse()

    # Toca a mensagem configurada
    response.say(
        Config.AMD_VOICEMAIL_MESSAGE,
        language='en-US',
        voice='Polly.Joanna'
    )

    # Desliga a chamada
    response.hangup()

    return str(response), 200, {'Content-Type': 'application/xml'}


# ============== API ENDPOINTS (with JWT authentication) ==============

@app.route("/make_call", methods=['POST'])
@jwt_required
def make_call():
    """
    Inicia uma chamada outbound
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    parameters:
      - name: to
        in: formData
        type: string
        required: true
        description: Numero de telefone destino (formato E.164, ex +15551234567)
    responses:
      200:
        description: Chamada iniciada com sucesso
        schema:
          properties:
            call_sid:
              type: string
            status:
              type: string
      400:
        description: Parametro 'to' ausente
      401:
        description: Token JWT invalido ou ausente
    """
    to_number = request.form.get('to')

    if not to_number:
        return jsonify({"error": "Missing 'to' parameter"}), 400

    if client is None:
        return jsonify({"error": "Twilio client is not initialized"}), 500

    try:
        # Seleciona Caller ID baseado no estado do lead
        caller_id = get_caller_id_for_number(to_number)
        lead_state = get_state_from_phone(to_number)

        print(f"[CALLER ID] Lead state: {lead_state} → Using: {caller_id}")

        # Parâmetros base da chamada
        call_params = {
            'url': f"{Config.BASE_URL}/outbound_connect",
            'to': to_number,
            'from_': caller_id,
            'record': True,
            'recording_channels': 'dual',
            'recording_status_callback': f"{Config.BASE_URL}/recording_status",
            'recording_status_callback_event': ['completed'],
            'status_callback': f"{Config.BASE_URL}/call_status",
            'status_callback_event': ['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'canceled', 'failed']
        }

        # Adiciona AMD se habilitado
        if Config.AMD_ENABLED:
            call_params['machine_detection'] = 'DetectMessageEnd'
            call_params['machine_detection_timeout'] = 30
            call_params['async_amd'] = True
            call_params['async_amd_status_callback'] = f"{Config.BASE_URL}/amd_status"
            call_params['async_amd_status_callback_method'] = 'POST'

        # Criar chamada via Twilio
        twilio_call = client.calls.create(**call_params)

        # Salvar chamada no banco
        call_record = Call(
            call_sid=twilio_call.sid,
            from_number=caller_id,
            to_number=to_number,
            lead_state=lead_state,
            direction='outbound',
            started_at=datetime.now(timezone.utc)
        )
        db.session.add(call_record)
        db.session.commit()

        return jsonify({
            "call_sid": twilio_call.sid,
            "message": "Call initiated"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/calls", methods=['GET'])
@jwt_required
def get_calls():
    """
    Lista historico de chamadas
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    parameters:
      - name: state
        in: query
        type: string
        required: false
        description: Filtrar por estado (ex CA, TX, NY)
      - name: disposition
        in: query
        type: string
        required: false
        description: Filtrar por disposition (answered, no-answer, busy, failed, completed, canceled)
      - name: direction
        in: query
        type: string
        required: false
        description: Filtrar por direcao (inbound, outbound)
      - name: limit
        in: query
        type: integer
        required: false
        default: 50
        description: Limite de resultados
    responses:
      200:
        description: Lista de chamadas
        schema:
          properties:
            count:
              type: integer
            calls:
              type: array
      401:
        description: Token JWT invalido ou ausente
    """
    # Parâmetros de filtro
    state = request.args.get('state')  # Filtrar por estado (ex: CA, TX)
    disposition = request.args.get('disposition')  # Filtrar por disposition (answered, no-answer, etc.)
    direction = request.args.get('direction')  # inbound ou outbound
    limit = request.args.get('limit', 50, type=int)  # Limite de resultados

    # Query base
    query = Call.query

    # Aplicar filtros
    if state:
        query = query.filter(Call.lead_state == state.upper())
    if disposition:
        query = query.filter(Call.disposition == disposition)
    if direction:
        query = query.filter(Call.direction == direction)

    # Ordenar por mais recente e limitar
    calls = query.order_by(Call.created_at.desc()).limit(limit).all()

    return jsonify({
        "count": len(calls),
        "calls": [call.to_dict() for call in calls]
    })


@app.route("/calls/stats", methods=['GET'])
@jwt_required
def get_calls_stats():
    """
    Estatisticas das chamadas por estado
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    responses:
      200:
        description: Estatisticas agrupadas por estado
        schema:
          properties:
            stats:
              type: array
      401:
        description: Token JWT invalido ou ausente
    """
    from sqlalchemy import func

    stats = db.session.query(
        Call.lead_state,
        func.count(Call.id).label('total'),
        func.sum(Call.duration).label('total_duration')
    ).group_by(Call.lead_state).all()

    return jsonify({
        "stats": [
            {
                "state": stat.lead_state or "Unknown",
                "total_calls": stat.total,
                "total_duration_seconds": stat.total_duration or 0
            }
            for stat in stats
        ]
    })


# ============== TWILIO VOICE SDK TOKEN ==============

@app.route("/token", methods=['GET'])
@jwt_required
def get_voice_token():
    """
    Gera token para o Twilio Voice SDK (chamadas via navegador)
    ---
    tags:
      - Voice SDK
    security:
      - Bearer: []
    parameters:
      - name: identity
        in: query
        type: string
        required: false
        description: Identidade do agente (default usa email do usuário logado)
    responses:
      200:
        description: Token gerado com sucesso
        schema:
          properties:
            token:
              type: string
            identity:
              type: string
            ttl:
              type: integer
      500:
        description: Erro ao gerar token (credenciais não configuradas)
    """
    # Verifica se as credenciais estão configuradas
    if not all([Config.TWILIO_ACCOUNT_SID, Config.TWILIO_API_KEY, Config.TWILIO_API_SECRET, Config.TWILIO_TWIML_APP_SID]):
        return jsonify({
            "error": "Twilio Voice SDK not configured",
            "missing": [
                k for k, v in {
                    "TWILIO_ACCOUNT_SID": Config.TWILIO_ACCOUNT_SID,
                    "TWILIO_API_KEY": Config.TWILIO_API_KEY,
                    "TWILIO_API_SECRET": Config.TWILIO_API_SECRET,
                    "TWILIO_TWIML_APP_SID": Config.TWILIO_TWIML_APP_SID
                }.items() if not v
            ]
        }), 500

    # Identidade do agente (usa email do usuário logado ou parâmetro)
    identity = request.args.get('identity') or g.current_user_email or 'agent'
    # Remove caracteres especiais da identidade (Twilio requer alfanumérico)
    identity = ''.join(c for c in identity if c.isalnum() or c in '_-')

    try:
        # Cria Access Token
        token = AccessToken(
            Config.TWILIO_ACCOUNT_SID,
            Config.TWILIO_API_KEY,
            Config.TWILIO_API_SECRET,
            identity=identity,
            ttl=Config.VOICE_TOKEN_TTL
        )

        # Adiciona grant de voz
        voice_grant = VoiceGrant(
            outgoing_application_sid=Config.TWILIO_TWIML_APP_SID,
            incoming_allow=True  # Permite receber chamadas
        )
        token.add_grant(voice_grant)

        print(f"[TOKEN] Generated voice token for {identity} (TTL: {Config.VOICE_TOKEN_TTL}s)")

        return jsonify({
            "token": token.to_jwt(),
            "identity": identity,
            "email": g.current_user_email,  # Email completo para uso no Lovable
            "ttl": Config.VOICE_TOKEN_TTL
        })

    except Exception as e:
        print(f"[TOKEN ERROR] {e}")
        return jsonify({"error": str(e)}), 500


# ============== ADMIN SETUP ==============

@app.route("/admin/delete_calls", methods=['POST'])
@jwt_required
def admin_delete_calls():
    """
    Deleta chamadas por IDs.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    parameters:
      - name: body
        in: body
        schema:
          properties:
            ids:
              type: array
              items:
                type: integer
    responses:
      200:
        description: Chamadas deletadas
    """
    data = request.get_json() or {}
    ids = data.get('ids', [])

    if not ids:
        return jsonify({"error": "No IDs provided"}), 400

    deleted = []
    for call_id in ids:
        call = Call.query.get(call_id)
        if call:
            db.session.delete(call)
            deleted.append(call_id)

    db.session.commit()
    return jsonify({"deleted": deleted, "count": len(deleted)})


@app.route("/calls/<call_sid>/resumo", methods=['PUT', 'PATCH'])
@jwt_required
def update_call_resumo(call_sid):
    """
    Atualiza o resumo/notas de uma chamada.
    ---
    tags:
      - Calls
    security:
      - Bearer: []
    parameters:
      - name: call_sid
        in: path
        type: string
        required: true
        description: SID da chamada
      - name: body
        in: body
        schema:
          properties:
            resumo:
              type: string
              description: Texto do resumo/notas da ligação
    responses:
      200:
        description: Resumo atualizado
      404:
        description: Chamada não encontrada
    """
    data = request.get_json() or {}
    resumo = data.get('resumo', '')

    call = Call.query.filter_by(call_sid=call_sid).first()

    if not call:
        # Tenta buscar por ID também
        try:
            call = Call.query.get(int(call_sid))
        except (ValueError, TypeError):
            pass

    if not call:
        return jsonify({"error": "Call not found"}), 404

    call.resumo = resumo
    db.session.commit()

    print(f"[RESUMO] Call {call_sid} resumo updated: {resumo[:50]}..." if len(resumo) > 50 else f"[RESUMO] Call {call_sid} resumo updated: {resumo}")

    return jsonify({
        "success": True,
        "call_sid": call.call_sid,
        "resumo": call.resumo
    })


@app.route("/admin/setup_workers", methods=['POST'])
@jwt_required
def admin_setup_workers():
    """
    Configura workers (SDRs) no sistema.
    Cria usuários Arthur e Eduarda, atualiza chamadas existentes.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    responses:
      200:
        description: Setup concluído com sucesso
      500:
        description: Erro durante o setup
    """
    from sqlalchemy import text
    from models.user import User

    results = []

    try:
        # 1. Adicionar coluna worker_email na tabela calls (se não existir)
        try:
            db.session.execute(text("ALTER TABLE calls ADD COLUMN worker_email VARCHAR(255)"))
            db.session.commit()
            results.append("Coluna worker_email adicionada")
        except Exception as e:
            db.session.rollback()
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                results.append("Coluna worker_email já existe")
            else:
                results.append(f"Aviso worker_email: {e}")

        # 2. Adicionar coluna name na tabela users (se não existir)
        try:
            db.session.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100)"))
            db.session.commit()
            results.append("Coluna name adicionada")
        except Exception as e:
            db.session.rollback()
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                results.append("Coluna name já existe")
            else:
                results.append(f"Aviso name: {e}")

        # 3. Criar usuário Arthur
        arthur = User.query.filter_by(email='arthur@fyntrainc.com').first()
        if not arthur:
            arthur = User(email='arthur@fyntrainc.com', name='Arthur')
            arthur.set_password('fyntra2025')
            db.session.add(arthur)
            db.session.commit()
            results.append("Usuário Arthur criado")
        else:
            if not arthur.name:
                arthur.name = 'Arthur'
                db.session.commit()
            results.append("Usuário Arthur já existe")

        # 4. Criar usuário Eduarda
        eduarda = User.query.filter_by(email='eduarda@fyntrainc.com').first()
        if not eduarda:
            eduarda = User(email='eduarda@fyntrainc.com', name='Eduarda')
            eduarda.set_password('fyntra2025')
            db.session.add(eduarda)
            db.session.commit()
            results.append("Usuário Eduarda criado")
        else:
            if not eduarda.name:
                eduarda.name = 'Eduarda'
                db.session.commit()
            results.append("Usuário Eduarda já existe")

        # 5. Atualizar chamadas existentes para Arthur
        calls_updated = Call.query.filter(
            (Call.worker_email == None) | (Call.worker_email == '')
        ).update({
            'worker_email': 'arthur@fyntrainc.com',
            'worker_name': 'Arthur'
        })
        db.session.commit()
        results.append(f"{calls_updated} chamadas atualizadas para Arthur")

        # Resumo
        total_users = User.query.count()
        total_calls = Call.query.count()

        return jsonify({
            "success": True,
            "results": results,
            "summary": {
                "total_users": total_users,
                "total_calls": total_calls
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/admin/fix_dispositions", methods=['POST'])
@jwt_required
def admin_fix_dispositions():
    """
    Corrige chamadas com disposition inconsistente.
    - NULL com duration > 0: answered
    - NULL com duration = 0: no-answer
    - no-answer com duration > 0: answered (bug fix)
    """
    results = []

    try:
        # 1. Busca chamadas com disposition NULL
        null_calls = Call.query.filter(Call.disposition == None).all()
        results.append(f"Encontradas {len(null_calls)} chamadas com disposition NULL")

        null_answered = 0
        null_no_answer = 0

        for call in null_calls:
            if call.duration and call.duration > 0:
                call.disposition = 'answered'
                if not call.answered_at and call.started_at:
                    call.answered_at = call.started_at
                null_answered += 1
            else:
                call.disposition = 'no-answer'
                null_no_answer += 1

        results.append(f"  → {null_answered} marcadas como 'answered'")
        results.append(f"  → {null_no_answer} marcadas como 'no-answer'")

        # 2. Busca chamadas no-answer com duration > 0 (bug)
        bad_no_answer = Call.query.filter(
            Call.disposition == 'no-answer',
            Call.duration > 0
        ).all()
        results.append(f"Encontradas {len(bad_no_answer)} chamadas no-answer com duration > 0")

        for call in bad_no_answer:
            call.disposition = 'answered'
            if not call.answered_at and call.started_at:
                call.answered_at = call.started_at

        results.append(f"  → {len(bad_no_answer)} corrigidas para 'answered'")

        db.session.commit()

        # Verifica se ainda há problemas
        remaining_null = Call.query.filter(Call.disposition == None).count()
        remaining_bad = Call.query.filter(Call.disposition == 'no-answer', Call.duration > 0).count()
        results.append(f"Restantes com NULL: {remaining_null}")
        results.append(f"Restantes no-answer com duration > 0: {remaining_bad}")

        return jsonify({
            "success": True,
            "results": results
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/admin/fix_inbound_dispositions", methods=['POST'])
@jwt_required
def admin_fix_inbound_dispositions():
    """
    Corrige dispositions de chamadas inbound incorretas.

    REGRA: Inbound calls com worker_name NULL = ninguém atendeu
    - Se disposition = 'answered' mas worker_name NULL → muda para 'no-answer'
    - Remove answered_at incorreto
    """
    results = []

    try:
        # Busca chamadas inbound marcadas como answered mas sem worker
        bad_answered = Call.query.filter(
            Call.direction == 'inbound',
            Call.disposition == 'answered',
            (Call.worker_name == None) | (Call.worker_name == '')
        ).all()

        results.append(f"Encontradas {len(bad_answered)} chamadas inbound 'answered' sem worker")

        fixed_count = 0
        for call in bad_answered:
            call.disposition = 'no-answer'
            call.answered_at = None  # Remove answered_at incorreto
            fixed_count += 1

        db.session.commit()
        results.append(f"  → {fixed_count} corrigidas para 'no-answer'")

        # Verifica se ainda há problemas
        remaining = Call.query.filter(
            Call.direction == 'inbound',
            Call.disposition == 'answered',
            (Call.worker_name == None) | (Call.worker_name == '')
        ).count()
        results.append(f"Restantes com problema: {remaining}")

        return jsonify({
            "success": True,
            "results": results
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/admin/setup_contact_tracking", methods=['POST'])
@jwt_required
def admin_setup_contact_tracking():
    """
    Configura as novas colunas de tracking de contato.
    - Adiciona colunas se não existirem
    - Calcula valores para chamadas existentes
    - Conta AMBAS direções (inbound + outbound) para cada lead
    - Exclui números Twilio do tracking
    """
    from sqlalchemy import text
    from core.phone_utils import get_contact_period, get_lead_phone_for_call

    results = []

    try:
        # 1. Adicionar novas colunas
        new_columns = [
            ("contact_number", "INTEGER"),
            ("contact_number_today", "INTEGER"),
            ("previously_answered", "BOOLEAN DEFAULT FALSE"),
            ("contact_period", "VARCHAR(20)"),
            ("resumo", "TEXT")  # Resumo/notas da ligação para Attio
        ]

        for col_name, col_type in new_columns:
            try:
                db.session.execute(text(f"ALTER TABLE calls ADD COLUMN {col_name} {col_type}"))
                db.session.commit()
                results.append(f"Coluna '{col_name}' adicionada")
            except Exception as e:
                db.session.rollback()
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    results.append(f"Coluna '{col_name}' já existe")
                else:
                    results.append(f"Erro em '{col_name}': {str(e)[:50]}")

        # Lista de números Twilio (não devem ser considerados como leads)
        twilio_numbers = [
            Config.TWILIO_NUMBER,
            Config.CALLER_ID_FL,
            Config.CALLER_ID_TX,
            Config.CALLER_ID_DEFAULT
        ]
        twilio_numbers_normalized = set(
            ''.join(c for c in n if c.isdigit())[-10:]
            for n in twilio_numbers if n
        )
        results.append(f"Números Twilio excluídos: {len(twilio_numbers_normalized)}")

        # 2. Calcular valores para chamadas existentes
        # Ordena por data para calcular sequência corretamente
        all_calls = Call.query.order_by(Call.started_at.asc()).all()
        results.append(f"Processando {len(all_calls)} chamadas...")

        # Dicionários para tracking (por lead, somando inbound + outbound)
        phone_contact_count = {}  # phone -> total count
        phone_daily_count = {}    # (phone, date) -> daily count
        phone_answered = {}       # phone -> was ever answered

        updated_count = 0
        skipped_twilio = 0

        for call in all_calls:
            # Determina o número do lead
            direction = call.direction or 'outbound'
            lead_phone = get_lead_phone_for_call(direction, call.from_number, call.to_number)

            if not lead_phone:
                continue

            # Normaliza o número (últimos 10 dígitos)
            lead_phone_normalized = ''.join(c for c in lead_phone if c.isdigit())[-10:]

            # Pula se o lead é um número Twilio
            if lead_phone_normalized in twilio_numbers_normalized:
                call.contact_number = None
                call.contact_number_today = None
                call.previously_answered = False
                call.contact_period = get_contact_period(call.started_at, call.lead_state)
                skipped_twilio += 1
                continue

            # Data da chamada
            call_date = call.started_at.date() if call.started_at else None

            # 1. Contact number (total - inbound + outbound)
            phone_contact_count[lead_phone_normalized] = phone_contact_count.get(lead_phone_normalized, 0) + 1
            call.contact_number = phone_contact_count[lead_phone_normalized]

            # 2. Contact number today
            if call_date:
                daily_key = (lead_phone_normalized, call_date)
                phone_daily_count[daily_key] = phone_daily_count.get(daily_key, 0) + 1
                call.contact_number_today = phone_daily_count[daily_key]
            else:
                call.contact_number_today = 1

            # 3. Previously answered (antes DESTA chamada)
            call.previously_answered = phone_answered.get(lead_phone_normalized, False)

            # Atualiza se esta chamada foi atendida (para próximas)
            if call.disposition == 'answered':
                phone_answered[lead_phone_normalized] = True

            # 4. Contact period
            call.contact_period = get_contact_period(call.started_at, call.lead_state)

            updated_count += 1

        db.session.commit()
        results.append(f"{updated_count} chamadas atualizadas com tracking")
        results.append(f"{skipped_twilio} chamadas puladas (números Twilio)")

        return jsonify({
            "success": True,
            "results": results
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/admin/analyze_calls", methods=['GET'])
def analyze_calls():
    """
    Análise diagnóstica das chamadas.
    Acesse: /admin/analyze_calls?date=2026-01-26
    """
    from sqlalchemy import func
    from datetime import datetime, timedelta

    date_str = request.args.get('date')  # formato: YYYY-MM-DD

    try:
        if date_str:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            target_date = datetime.utcnow().date()

        # Query chamadas do dia
        calls = Call.query.filter(
            func.date(Call.created_at) == target_date
        ).order_by(Call.created_at.desc()).all()

        # Análise de dispositions
        disposition_counts = {}
        for call in calls:
            d = call.disposition or 'NULL'
            disposition_counts[d] = disposition_counts.get(d, 0) + 1

        # Chamadas com contact_number estranho (>= 50)
        strange_contact = []
        for call in calls:
            if call.contact_number and call.contact_number >= 50:
                strange_contact.append({
                    'id': call.id,
                    'call_sid': call.call_sid,
                    'to_number': call.to_number,
                    'from_number': call.from_number,
                    'contact_number': call.contact_number,
                    'disposition': call.disposition,
                    'duration': call.duration,
                    'direction': call.direction,
                    'created_at': call.created_at.isoformat() if call.created_at else None
                })

        # Chamadas failed
        failed_calls = []
        for call in calls:
            if call.disposition == 'failed':
                failed_calls.append({
                    'id': call.id,
                    'call_sid': call.call_sid,
                    'to_number': call.to_number,
                    'from_number': call.from_number,
                    'direction': call.direction,
                    'duration': call.duration,
                    'created_at': call.created_at.isoformat() if call.created_at else None
                })

        # Todas as chamadas do dia (resumo)
        all_calls = []
        for call in calls[:100]:  # Limita a 100
            all_calls.append({
                'id': call.id,
                'direction': call.direction,
                'from': call.from_number,
                'to': call.to_number,
                'disposition': call.disposition,
                'duration': call.duration,
                'contact_number': call.contact_number,
                'contact_number_today': call.contact_number_today,
                'answered_at': call.answered_at.isoformat() if call.answered_at else None,
                'created_at': call.created_at.isoformat() if call.created_at else None
            })

        return jsonify({
            'date': str(target_date),
            'total_calls': len(calls),
            'disposition_summary': disposition_counts,
            'strange_contact_numbers': {
                'count': len(strange_contact),
                'calls': strange_contact
            },
            'failed_calls': {
                'count': len(failed_calls),
                'calls': failed_calls
            },
            'all_calls': all_calls
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== ATTIO CRM INTEGRATION ==============

@app.route("/attio/lead", methods=['GET'])
@jwt_required
def get_attio_lead():
    """
    Busca dados do lead no Attio pelo número de telefone
    ---
    tags:
      - Attio
    security:
      - Bearer: []
    parameters:
      - name: phone
        in: query
        type: string
        required: true
        description: Número de telefone para buscar (formato E.164 ou 10 dígitos)
    responses:
      200:
        description: Dados do lead encontrado
      404:
        description: Lead não encontrado
      500:
        description: Erro na integração com Attio
    """
    phone = request.args.get('phone')

    if not phone:
        return jsonify({"error": "Missing 'phone' parameter"}), 400

    attio = get_attio_client()
    if attio is None:
        return jsonify({"error": "Attio integration not configured"}), 500

    try:
        lead = attio.search_person_by_phone(phone)  # type: ignore[union-attr]

        if lead:
            # Include raw if debug param is set
            if request.args.get('debug') == 'true':
                print(f"[ATTIO] Found lead for {phone}: {lead.get('name', 'Unknown')} (debug mode)")
                return jsonify({"found": True, "lead": lead})
            else:
                # Remove raw data from response (too verbose)
                lead_response = {k: v for k, v in lead.items() if k != 'raw'}
                print(f"[ATTIO] Found lead for {phone}: {lead_response.get('name', 'Unknown')}")
                return jsonify({"found": True, "lead": lead_response})
        else:
            print(f"[ATTIO] No lead found for {phone}")
            return jsonify({"found": False, "lead": None}), 404

    except Exception as e:
        print(f"[ATTIO ERROR] {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/attio/lead/note", methods=['POST'])
@jwt_required
def add_attio_note():
    """
    Adiciona uma nota ao lead no Attio (para logar resultado da chamada)
    ---
    tags:
      - Attio
    security:
      - Bearer: []
    parameters:
      - name: record_id
        in: formData
        type: string
        required: true
        description: ID do record no Attio
      - name: note
        in: formData
        type: string
        required: true
        description: Conteúdo da nota
    responses:
      200:
        description: Nota adicionada com sucesso
      400:
        description: Parâmetros ausentes
      500:
        description: Erro na integração com Attio
    """
    record_id = request.form.get('record_id')
    note = request.form.get('note')

    if not record_id or not note:
        return jsonify({"error": "Missing 'record_id' or 'note' parameter"}), 400

    attio = get_attio_client()
    if attio is None:
        return jsonify({"error": "Attio integration not configured"}), 500

    try:
        success = attio.add_note_to_person(record_id, note)  # type: ignore[union-attr]

        if success:
            print(f"[ATTIO] Note added to record {record_id}")
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "error": "Failed to add note"}), 500

    except Exception as e:
        print(f"[ATTIO ERROR] {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/attio/contacts", methods=['GET'])
@jwt_required
def search_attio_contacts():
    """
    Busca contatos no Attio por nome ou telefone
    ---
    tags:
      - Attio
    security:
      - Bearer: []
    parameters:
      - name: q
        in: query
        type: string
        required: false
        description: Termo de busca (nome ou telefone)
      - name: limit
        in: query
        type: integer
        required: false
        default: 50
        description: Limite de resultados
    responses:
      200:
        description: Lista de contatos
      500:
        description: Erro na integração com Attio
    """
    query = request.args.get('q', '').strip()
    limit = int(request.args.get('limit', 50))

    attio = get_attio_client()
    if attio is None:
        return jsonify({"error": "Attio integration not configured"}), 500

    try:
        contacts = attio.search_people(query if query else None, limit)  # type: ignore[union-attr]
        print(f"[ATTIO] Contacts search: query='{query}', found={len(contacts)}")
        return jsonify({"contacts": contacts, "count": len(contacts)})

    except Exception as e:
        print(f"[ATTIO ERROR] {e}")
        return jsonify({"error": str(e)}), 500


# ============== MAIN ==============

if __name__ == "__main__":
    # Development only - production uses Gunicorn
    debug_mode = os.environ.get('FLASK_ENV', 'production') == 'development'
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
