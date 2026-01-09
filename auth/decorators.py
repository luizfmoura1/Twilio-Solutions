import os
from functools import wraps
from flask import request, jsonify, g
import jwt
from twilio.request_validator import RequestValidator


def jwt_required(f):
    """
    Decorator for API endpoints requiring JWT authentication.
    Accepts: Authorization: Bearer <token> OR Authorization: <token>
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return jsonify({'error': 'Missing Authorization header'}), 401

        # Aceita tanto "Bearer TOKEN" quanto apenas "TOKEN"
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]
        else:
            return jsonify({'error': 'Invalid Authorization header format. Use: Bearer TOKEN ou apenas TOKEN'}), 401

        try:
            payload = jwt.decode(
                token,
                os.environ.get('JWT_SECRET'),
                algorithms=['HS256']
            )
            g.current_user_id = payload['user_id']
            g.current_user_email = payload['email']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)

    return decorated_function


def validate_twilio_signature(f):
    """
    Decorator for Twilio webhook endpoints.
    Validates the X-Twilio-Signature header to ensure requests are from Twilio.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip validation in development if configured
        if os.environ.get('SKIP_TWILIO_VALIDATION', '').lower() == 'true':
            return f(*args, **kwargs)

        auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
        validator = RequestValidator(auth_token)

        # Handle ngrok/proxy: use BASE_URL + path for validation
        base_url = os.environ.get('BASE_URL', '')
        if base_url:
            url = base_url + request.path
        else:
            url = request.url

        post_vars = request.form.to_dict()
        signature = request.headers.get('X-Twilio-Signature', '')

        if not validator.validate(url, post_vars, signature):
            return jsonify({'error': 'Invalid Twilio signature'}), 403

        return f(*args, **kwargs)

    return decorated_function
