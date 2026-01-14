import os
import secrets
from dotenv import load_dotenv

load_dotenv()


def get_jwt_secret():
    """Get JWT secret, generating a temporary one for development if not set."""
    secret = os.environ.get('JWT_SECRET')
    if not secret:
        if os.environ.get('FLASK_ENV') == 'production':
            raise ValueError('JWT_SECRET must be set in production environment')
        # Generate temporary secret for development (will change on restart)
        return secrets.token_hex(32)
    return secret


def get_database_url():
    """Get database URL, fixing postgres:// to postgresql:// for SQLAlchemy."""
    url = os.environ.get('DATABASE_URL', 'sqlite:///twilio_app.db')
    # Railway/Heroku use postgres:// but SQLAlchemy needs postgresql://
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url


class Config:
    # Twilio
    TWILIO_ACCOUNT_SID: str = os.environ.get('TWILIO_ACCOUNT_SID', '')
    TWILIO_AUTH_TOKEN: str = os.environ.get('TWILIO_AUTH_TOKEN', '')
    TWILIO_NUMBER: str = os.environ.get('TWILIO_NUMBER', '')
    TWILIO_WORKFLOW_SID: str = os.environ.get('TWILIO_WORKFLOW_SID', '')
    TWILIO_WORKSPACE_SID: str = os.environ.get('TWILIO_WORKSPACE_SID', '')
    BASE_URL: str = os.environ.get('BASE_URL', '')

    # Database
    SQLALCHEMY_DATABASE_URI: str = get_database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # JWT
    JWT_SECRET: str = get_jwt_secret()
    JWT_EXPIRATION_HOURS: int = int(os.environ.get('JWT_EXPIRATION_HOURS', '24'))

    # Development
    SKIP_TWILIO_VALIDATION: bool = os.environ.get('SKIP_TWILIO_VALIDATION', 'false').lower() == 'true'

    # Slack Alerts
    SLACK_WEBHOOK_URL: str = os.environ.get('SLACK_WEBHOOK_URL', '')

    # WhatsApp Alerts (uses Twilio API)
    WHATSAPP_FROM_NUMBER: str = os.environ.get('WHATSAPP_FROM_NUMBER', '')  # whatsapp:+14155238886
    WHATSAPP_TO_NUMBER: str = os.environ.get('WHATSAPP_TO_NUMBER', '')  # whatsapp:+5511999999999

    # Alert Preferences (which events trigger alerts)
    ALERT_ON_INITIATED: bool = os.environ.get('ALERT_ON_INITIATED', 'true').lower() == 'true'
    ALERT_ON_RINGING: bool = os.environ.get('ALERT_ON_RINGING', 'false').lower() == 'true'
    ALERT_ON_ANSWERED: bool = os.environ.get('ALERT_ON_ANSWERED', 'true').lower() == 'true'
    ALERT_ON_COMPLETED: bool = os.environ.get('ALERT_ON_COMPLETED', 'true').lower() == 'true'
    ALERT_ON_MISSED: bool = os.environ.get('ALERT_ON_MISSED', 'true').lower() == 'true'
    ALERT_ON_FAILED: bool = os.environ.get('ALERT_ON_FAILED', 'true').lower() == 'true'
    ALERT_ON_RECORDING: bool = os.environ.get('ALERT_ON_RECORDING', 'false').lower() == 'true'
