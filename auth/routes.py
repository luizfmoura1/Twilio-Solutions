import re
from flask import Blueprint, request, jsonify, g
from models.user import User
from database import db
from auth.jwt_utils import create_token
from auth.decorators import jwt_required

auth_bp = Blueprint('auth', __name__)


def is_valid_email(email):
    """Simple email validation"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user
    Expects JSON: {"email": "...", "password": "..."}
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    if not is_valid_email(email):
        return jsonify({'error': 'Invalid email format'}), 400

    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({'error': 'Email already registered'}), 409

    user = User(email=email)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    token = create_token(user.id, user.email)

    return jsonify({
        'message': 'User registered successfully',
        'user': user.to_dict(),
        'token': token
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate user and return JWT token
    Expects JSON: {"email": "...", "password": "..."}
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401

    if not user.is_active:
        return jsonify({'error': 'Account is deactivated'}), 403

    token = create_token(user.id, user.email)

    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'token': token
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required
def get_current_user():
    """
    Get current authenticated user's information
    Requires: Authorization: Bearer <token>
    """
    user = User.query.get(g.current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({'user': user.to_dict()}), 200
