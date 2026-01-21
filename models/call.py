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
    disposition = db.Column(db.String(30))  # answered, busy, no-answer, failed, voicemail, canceled
    duration = db.Column(db.Integer, default=0)  # Total call duration in seconds
    queue_time = db.Column(db.Integer, default=0)  # Time waiting in queue (seconds)
    recording_url = db.Column(db.Text)
    recording_sid = db.Column(db.String(50))
    caller_city = db.Column(db.String(100))  # City of the caller (from Twilio)
    worker_name = db.Column(db.String(100))  # Agent name from TaskRouter
    worker_email = db.Column(db.String(255))  # Email do SDR que atendeu/fez a chamada
    started_at = db.Column(db.DateTime(timezone=True))
    answered_at = db.Column(db.DateTime(timezone=True))
    ended_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'call_sid': self.call_sid,
            'from_number': self.from_number,
            'to_number': self.to_number,
            'lead_state': self.lead_state,
            'direction': self.direction,
            'disposition': self.disposition,
            'duration': self.duration,
            'queue_time': self.queue_time,
            'recording_url': self.recording_url,
            'caller_city': self.caller_city,
            'worker_name': self.worker_name,
            'worker_email': self.worker_email,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Call {self.call_sid} - {self.disposition}>'
