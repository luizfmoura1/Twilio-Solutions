from datetime import datetime
from core.database import db


class Call(db.Model):
    __tablename__ = 'calls'

    id = db.Column(db.Integer, primary_key=True)
    call_sid = db.Column(db.String(50), unique=True, nullable=False, index=True)
    from_number = db.Column(db.String(20), nullable=False)
    to_number = db.Column(db.String(20), nullable=False)
    lead_state = db.Column(db.String(2))  # US state code (CA, TX, NY, FL, etc.)
    direction = db.Column(db.String(20))  # inbound, outbound
    status = db.Column(db.String(20))  # initiated, ringing, answered, completed, failed, busy, no-answer
    duration = db.Column(db.Integer, default=0)
    recording_url = db.Column(db.Text)
    started_at = db.Column(db.DateTime)
    answered_at = db.Column(db.DateTime)
    ended_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'call_sid': self.call_sid,
            'from_number': self.from_number,
            'to_number': self.to_number,
            'lead_state': self.lead_state,
            'direction': self.direction,
            'status': self.status,
            'duration': self.duration,
            'recording_url': self.recording_url,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Call {self.call_sid} - {self.status}>'
