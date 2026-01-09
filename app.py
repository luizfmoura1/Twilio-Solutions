import os
from datetime import datetime, timezone
from flask import Flask, request, jsonify, g
from twilio.twiml.voice_response import VoiceResponse
from twilio.rest import Client
from dotenv import load_dotenv
from flasgger import Swagger

from core.config import Config
from core.database import db, init_db
from core.phone_utils import get_state_from_phone
from models.call import Call
from auth.routes import auth_bp
from auth.decorators import jwt_required, validate_twilio_signature

load_dotenv()

app = Flask(__name__)
app.config.from_object(Config)

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

# Initialize database
init_db(app)

# Register auth blueprint
app.register_blueprint(auth_bp, url_prefix='/auth')

# Twilio client
client = Client(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN)


# ============== TWILIO WEBHOOKS (with signature validation) ==============

@app.route("/voice", methods=['POST'])
@validate_twilio_signature
def voice():
    """Atende chamada: toca disclaimer e enfileira"""
    # Captura dados da chamada inbound
    call_sid = request.form.get('CallSid')
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', 'inbound')

    # Salva chamada no banco
    existing_call = Call.query.filter_by(call_sid=call_sid).first()
    if not existing_call:
        lead_state = get_state_from_phone(from_number)
        call = Call(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
            lead_state=lead_state,
            direction=direction,
            status='ringing',
            started_at=datetime.now(timezone.utc)
        )
        db.session.add(call)
        db.session.commit()
        print(f"[INBOUND] New call {call_sid} from {from_number} - State: {lead_state}")

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
    """Callback do TaskRouter quando encontra agente disponivel"""
    return jsonify({
        "instruction": "dequeue",
        "from": Config.TWILIO_NUMBER,
        "post_work_activity_sid": None
    })


@app.route("/call_status", methods=['POST'])
@validate_twilio_signature
def call_status():
    """
    Recebe atualizacoes de status da chamada e salva no banco.
    Eventos: initiated, ringing, in-progress, completed, busy, no-answer, canceled, failed
    """
    call_sid = request.form.get('CallSid')
    status = request.form.get('CallStatus')
    duration = request.form.get('CallDuration', 0)
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', '')
    sip_response_code = request.form.get('SipResponseCode', '')

    # Busca ou cria registro da chamada
    call = Call.query.filter_by(call_sid=call_sid).first()

    if not call:
        # Determina o número do lead (depende da direção)
        lead_number = from_number if direction == 'inbound' else to_number
        lead_state = get_state_from_phone(lead_number)

        call = Call(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
            lead_state=lead_state,
            direction=direction,
            status=status,
            started_at=datetime.now(timezone.utc)
        )
        db.session.add(call)
    else:
        # Atualiza status existente
        call.status = status

    # Atualiza campos baseado no status
    if status == 'in-progress' and not call.answered_at:
        call.answered_at = datetime.now(timezone.utc)
        call.disposition = 'answered'
    elif status == 'completed':
        call.ended_at = datetime.now(timezone.utc)
        call.duration = int(duration) if duration else 0
        # Se não teve disposition ainda, marca como answered (completou normalmente)
        if not call.disposition:
            call.disposition = 'answered'
    elif status == 'busy':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'busy'
    elif status == 'no-answer':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'no-answer'
    elif status == 'failed':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'failed'
    elif status == 'canceled':
        call.ended_at = datetime.now(timezone.utc)
        call.disposition = 'canceled'

    db.session.commit()

    print(f"[STATUS] Call {call_sid}: {status} | Disposition: {call.disposition} | Duration: {duration}s")

    return '', 204


@app.route("/recording_status", methods=['POST'])
@validate_twilio_signature
def recording_status():
    """
    Recebe callback quando gravacao esta pronta.
    Salva a URL da gravacao no banco.
    """
    call_sid = request.form.get('CallSid')
    recording_sid = request.form.get('RecordingSid')
    recording_url = request.form.get('RecordingUrl')
    recording_status = request.form.get('RecordingStatus')
    recording_duration = request.form.get('RecordingDuration', 0)

    if recording_status == 'completed' and recording_url:
        call = Call.query.filter_by(call_sid=call_sid).first()
        if call:
            # URL com formato .mp3 para facilitar reprodução
            call.recording_url = f"{recording_url}.mp3"
            call.recording_sid = recording_sid
            db.session.commit()
            print(f"[RECORDING] Call {call_sid}: Recording saved - {recording_url}.mp3")
        else:
            print(f"[RECORDING] Call {call_sid} not found in database")
    else:
        print(f"[RECORDING] Call {call_sid}: Status {recording_status}")

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

        # Salvar chamada no banco com agent_id
        lead_state = get_state_from_phone(to_number)
        call_record = Call(
            call_sid=twilio_call.sid,
            from_number=Config.TWILIO_NUMBER,
            to_number=to_number,
            lead_state=lead_state,
            direction='outbound',
            status='initiated',
            agent_id=g.current_user_id,
            started_at=datetime.now(timezone.utc)
        )
        db.session.add(call_record)
        db.session.commit()

        return jsonify({
            "call_sid": twilio_call.sid,
            "status": "initiated",
            "agent_id": g.current_user_id
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
      - name: status
        in: query
        type: string
        required: false
        description: Filtrar por status (completed, answered, no-answer, busy, failed)
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
    status = request.args.get('status')  # Filtrar por status (completed, answered, etc.)
    direction = request.args.get('direction')  # inbound ou outbound
    limit = request.args.get('limit', 50, type=int)  # Limite de resultados

    # Query base
    query = Call.query

    # Aplicar filtros
    if state:
        query = query.filter(Call.lead_state == state.upper())
    if status:
        query = query.filter(Call.status == status)
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


if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
