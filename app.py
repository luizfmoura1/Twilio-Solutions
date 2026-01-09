import os
from datetime import datetime
from flask import Flask, request, jsonify
from twilio.twiml.voice_response import VoiceResponse
from twilio.rest import Client
from dotenv import load_dotenv

from core.config import Config
from core.database import db, init_db
from core.phone_utils import get_state_from_phone
from models.call import Call
from auth.routes import auth_bp
from auth.decorators import jwt_required, validate_twilio_signature

load_dotenv()

app = Flask(__name__)
app.config.from_object(Config)

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
    """Recebe atualizacoes de status da chamada e salva no banco"""
    call_sid = request.form.get('CallSid')
    status = request.form.get('CallStatus')
    duration = request.form.get('CallDuration', 0)
    from_number = request.form.get('From', '')
    to_number = request.form.get('To', '')
    direction = request.form.get('Direction', '')

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
            started_at=datetime.utcnow()
        )
        db.session.add(call)
    else:
        # Atualiza status existente
        call.status = status

    # Atualiza campos baseado no status
    if status == 'answered' and not call.answered_at:
        call.answered_at = datetime.utcnow()
    elif status == 'completed':
        call.ended_at = datetime.utcnow()
        call.duration = int(duration) if duration else 0

    db.session.commit()

    print(f"Call {call_sid}: {status} (duration: {duration}s) - State: {call.lead_state}")

    return '', 204


# ============== API ENDPOINTS (with JWT authentication) ==============

@app.route("/make_call", methods=['POST'])
@jwt_required
def make_call():
    """Inicia chamada outbound - requires JWT authentication"""
    to_number = request.form.get('to')

    if not to_number:
        return jsonify({"error": "Missing 'to' parameter"}), 400

    try:
        call = client.calls.create(
            url=f"{Config.BASE_URL}/voice",
            to=to_number,
            from_=Config.TWILIO_NUMBER,
            record=True,
            recording_channels='dual',
            status_callback=f"{Config.BASE_URL}/call_status",
            status_callback_event=['initiated', 'ringing', 'answered', 'completed']
        )
        return jsonify({"call_sid": call.sid, "status": "initiated"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/calls", methods=['GET'])
@jwt_required
def get_calls():
    """Retorna histórico de chamadas com filtros opcionais"""
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
    """Retorna estatísticas das chamadas por estado"""
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
