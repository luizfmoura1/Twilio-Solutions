import os
from datetime import datetime, timedelta
import jwt


def create_token(user_id, email):
    """Create a JWT token for authenticated user"""
    expiration = datetime.utcnow() + timedelta(
        hours=int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
    )

    payload = {
        'user_id': user_id,
        'email': email,
        'exp': expiration,
        'iat': datetime.utcnow()
    }

    return jwt.encode(payload, os.environ.get('JWT_SECRET'), algorithm='HS256')


def decode_token(token):
    """Decode and validate a JWT token"""
    return jwt.decode(token, os.environ.get('JWT_SECRET'), algorithms=['HS256'])
