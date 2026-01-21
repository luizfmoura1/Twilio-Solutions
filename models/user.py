from datetime import datetime, timezone
from core.database import db
import bcrypt


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100))  # Nome do usuário (ex: Arthur, Eduarda)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def set_password(self, password):
        """Hash password with bcrypt"""
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(
            password.encode('utf-8'), salt
        ).decode('utf-8')

    def check_password(self, password):
        """Verify password against hash"""
        return bcrypt.checkpw(
            password.encode('utf-8'),
            self.password_hash.encode('utf-8')
        )

    def to_dict(self):
        """Return user data without sensitive fields"""
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active
        }
