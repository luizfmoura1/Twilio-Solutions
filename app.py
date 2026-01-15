import os
import json
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify, g
from twilio.twiml.voice_response import VoiceResponse
from twilio.rest import Client
from dotenv import load_dotenv
from flasgger import Swagger

from core.config import Config
from core.database import db, init_db
from core.phone_utils import get_state_from_phone
from core.alerts import init_alerts, get_alert_manager, CallAlert
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
    """Atende chamada: toca disclaimer e enfileira"""
    # Captura dados da chamada inbound
    call_sid = request.form.get('CallSid', '')
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', 'inbound')

    # Salva chamada no banco
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
                direction='inbound'
            )
            alert_manager.notify_call_status(alert)


    response = VoiceResponse()

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
                    worker_name=worker_name
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
    status = request.form.get('CallStatus', '')
    duration = request.form.get('CallDuration', '0')
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', '')

    # Debug: log all incoming webhook data
    print(f"[WEBHOOK DEBUG] CallSid={call_sid}, Status={status}, Direction={direction}, From={from_number}, To={to_number}")

    if not call_sid:
        return '', 400

    # Busca ou cria registro da chamada
    call = Call.query.filter_by(call_sid=call_sid).first()

    if not call:
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

    # Atualiza campos baseado no status
    twilio_duration = int(duration) if duration else 0

    if status == 'completed':
        call.ended_at = datetime.now(timezone.utc)
        # Só é "answered" se o agente atendeu (answered_at foi setado pelo /assignment)
        if call.answered_at:
            call.disposition = 'answered'
            # Duration = tempo de conversa (ended_at - answered_at)
            calculated_duration = int((call.ended_at - call.answered_at).total_seconds())
        else:
            # Agente não atendeu = Missed Call
            call.disposition = 'no-answer'
            # Duration = tempo total (ended_at - started_at)
            if call.started_at:
                calculated_duration = int((call.ended_at - call.started_at).total_seconds())
            else:
                calculated_duration = 0
        # Use o maior valor entre calculado e Twilio (fallback)
        call.duration = max(calculated_duration, twilio_duration, 0)
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
            worker_name=call.worker_name
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
                    direction=call.direction or ''
                )
                alert_manager.notify_recording_ready(alert)
        else:
            print(f"[RECORDING] Call {call_sid} not found in database")
    else:
        print(f"[RECORDING] Call {call_sid}: Status {rec_status}")

    return '', 204


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
        # Criar chamada via Twilio com todos os callbacks
        twilio_call = client.calls.create(
            url=f"{Config.BASE_URL}/voice",
            to=to_number,
            from_=Config.TWILIO_NUMBER,
            record=True,
            recording_channels='dual',
            recording_status_callback=f"{Config.BASE_URL}/recording_status",
            recording_status_callback_event=['completed'],
            status_callback=f"{Config.BASE_URL}/call_status",
            status_callback_event=['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'canceled', 'failed']
        )

        # Salvar chamada no banco
        lead_state = get_state_from_phone(to_number)
        call_record = Call(
            call_sid=twilio_call.sid,
            from_number=Config.TWILIO_NUMBER,
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


# ============== MAIN ==============

if __name__ == "__main__":
    # Development only - production uses Gunicorn
    debug_mode = os.environ.get('FLASK_ENV', 'production') == 'development'
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
