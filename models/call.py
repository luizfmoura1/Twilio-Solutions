from datetime import datetime, timezone
from core.database import db


def utcnow():
    return datetime.now(timezone.utc)


class Call(db.Model):
    __tablename__ = 'calls'

    id = db.Column(db.Integer, primary_key=True)
    call_sid = db.Column(db.String(50), unique=True, nullable=False, index=True)
    from_number = db.Column(db.String(20), nullable=False)
    to_number = db.Column(db.String(20), nullable=False)
    lead_state = db.Column(db.String(2))  # US state code (CA, TX, NY, FL, etc.)
    direction = db.Column(db.String(20))  # inbound, outbound
    status = db.Column(db.String(20))  # initiated, ringing, in-progress, completed, failed, busy, no-answer, canceled
    duration = db.Column(db.Integer, default=0)
    recording_url = db.Column(db.Text)
    recording_sid = db.Column(db.String(50))
    started_at = db.Column(db.DateTime(timezone=True))
    answered_at = db.Column(db.DateTime(timezone=True))
    ended_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Novos campos
    agent_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    worker_name = db.Column(db.String(100))  # Nome do agente que atendeu (do TaskRouter)
    cost = db.Column(db.Numeric(10, 4), default=0)  # Custo em USD
    disposition = db.Column(db.String(30))  # answered, busy, no-answer, failed, voicemail, canceled

    # Relationship
    agent = db.relationship('User', backref='calls', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'call_sid': self.call_sid,
            'from_number': self.from_number,
            'to_number': self.to_number,
            'lead_state': self.lead_state,
            'direction': self.direction,
            'status': self.status,
            'disposition': self.disposition,
            'duration': self.duration,
            'cost': float(self.cost) if self.cost else 0,
            'recording_url': self.recording_url,
            'recording_sid': self.recording_sid,
            'agent_id': self.agent_id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Call {self.call_sid} - {self.status}>'
