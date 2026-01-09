import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Twilio
    TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
    TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
    TWILIO_NUMBER = os.environ.get('TWILIO_NUMBER')
    TWILIO_WORKFLOW_SID = os.environ.get('TWILIO_WORKFLOW_SID')
    TWILIO_WORKSPACE_SID = os.environ.get('TWILIO_WORKSPACE_SID')
    BASE_URL = os.environ.get('BASE_URL')

    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET = os.environ.get('JWT_SECRET')
    JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
