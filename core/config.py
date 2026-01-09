import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Twilio
    TWILIO_ACCOUNT_SID: str = os.environ.get('TWILIO_ACCOUNT_SID', '')
    TWILIO_AUTH_TOKEN: str = os.environ.get('TWILIO_AUTH_TOKEN', '')
    TWILIO_NUMBER: str = os.environ.get('TWILIO_NUMBER', '')
    TWILIO_WORKFLOW_SID: str = os.environ.get('TWILIO_WORKFLOW_SID', '')
    TWILIO_WORKSPACE_SID: str = os.environ.get('TWILIO_WORKSPACE_SID', '')
    BASE_URL: str = os.environ.get('BASE_URL', '')

    # Database
    SQLALCHEMY_DATABASE_URI: str = os.environ.get('DATABASE_URL', 'sqlite:///twilio_app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # JWT
    JWT_SECRET: str = os.environ.get('JWT_SECRET', 'dev-secret-change-in-production')
    JWT_EXPIRATION_HOURS: int = int(os.environ.get('JWT_EXPIRATION_HOURS', '24'))

    # Development
    SKIP_TWILIO_VALIDATION: bool = os.environ.get('SKIP_TWILIO_VALIDATION', 'false').lower() == 'true'
