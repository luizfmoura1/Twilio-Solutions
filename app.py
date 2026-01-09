import os
from flask import Flask, request, jsonify
from twilio.twiml.voice_response import VoiceResponse
from twilio.rest import Client
from dotenv import load_dotenv

from config import Config
from database import db, init_db
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
    """Recebe atualizacoes de status da chamada"""
    call_sid = request.form.get('CallSid')
    status = request.form.get('CallStatus')
    duration = request.form.get('CallDuration', 0)

    print(f"Call {call_sid}: {status} (duration: {duration}s)")

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


if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
