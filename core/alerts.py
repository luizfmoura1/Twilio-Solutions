"""
Alerts module for sending notifications to Slack.
"""
import logging
from typing import Optional
from dataclasses import dataclass
import httpx

from core.config import Config

logger = logging.getLogger(__name__)


@dataclass
class CallAlert:
    """Data structure for call alert information."""
    call_sid: str
    from_number: str
    to_number: str
    status: str
    duration: int = 0
    disposition: Optional[str] = None
    lead_state: Optional[str] = None
    recording_url: Optional[str] = None
    direction: str = ''
    worker_name: Optional[str] = None
    lead_name: Optional[str] = None
    caller_city: Optional[str] = None


class SlackNotifier:
    """Send notifications to Slack via webhook."""

    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
        self.enabled = bool(webhook_url)

    def _get_status_emoji(self, status: str) -> str:
        """Return emoji based on call status."""
        status_emojis = {
            'initiated': ':outbox_tray:',
            'ringing': ':bell:',
            'in-progress': ':headphones:',
            'answered': ':white_check_mark:',
            'completed': ':white_check_mark:',
            'no-answer': ':x:',
            'busy': ':no_entry:',
            'failed': ':warning:',
            'canceled': ':heavy_multiplication_x:'
        }
        return status_emojis.get(status, ':phone:')

    def _get_status_message(self, status: str, direction: str = '') -> str:
        """Return human-readable message for call status."""
        status_messages = {
            'initiated': 'Outgoing Call',
            'ringing': 'Incoming Call' if direction == 'inbound' else 'Ringing',
            'in-progress': 'Call Answered by Agent',
            'answered': 'Call Completed',
            'completed': 'Call Completed',
            'no-answer': 'Missed Call',
            'busy': 'Line Busy',
            'failed': 'Call Failed',
            'canceled': 'Call Canceled'
        }
        return status_messages.get(status, status.upper())

    def _format_duration(self, seconds: int) -> str:
        """Format duration in minutes and seconds."""
        if seconds < 60:
            return f"{seconds}s"
        minutes = seconds // 60
        remaining_seconds = seconds % 60
        return f"{minutes}m {remaining_seconds}s"

    def send_call_alert(self, alert: CallAlert) -> bool:
        """Send call status alert to Slack."""
        if not self.enabled:
            logger.debug("Slack notifications disabled - no webhook URL configured")
            return False

        display_status = alert.status
        emoji = self._get_status_emoji(display_status)
        status_message = self._get_status_message(display_status, alert.direction)
        display_state = alert.lead_state if alert.lead_state else 'Unknown'
        worker = alert.worker_name if alert.worker_name else None

        # Format lead info (name + phone or just phone)
        lead_display = alert.from_number if alert.direction == 'inbound' else alert.to_number
        if alert.lead_name:
            lead_display = f"{alert.lead_name}\n{lead_display}"
        elif alert.caller_city:
            lead_display = f"{lead_display}\n{alert.caller_city}"

        # Build fields based on status type
        if display_status == 'ringing':
            # Incoming Call: lead, to, state (no duration)
            fields = [
                {"type": "mrkdwn", "text": f"*Lead:*\n{lead_display}"},
                {"type": "mrkdwn", "text": f"*To:*\n{alert.to_number}"},
                {"type": "mrkdwn", "text": f"*State:*\n{display_state}"}
            ]
        elif display_status == 'in-progress':
            # Call Answered: lead, agent
            fields = [
                {"type": "mrkdwn", "text": f"*Lead:*\n{lead_display}"}
            ]
            if worker:
                fields.append({"type": "mrkdwn", "text": f"*Agent:*\n{worker}"})
        elif display_status in ('answered', 'completed'):
            # Call Completed: lead, state, agent, duration
            duration_str = self._format_duration(alert.duration) if alert.duration > 0 else "N/A"
            fields = [
                {"type": "mrkdwn", "text": f"*Lead:*\n{lead_display}"},
                {"type": "mrkdwn", "text": f"*State:*\n{display_state}"},
                {"type": "mrkdwn", "text": f"*Duration:*\n{duration_str}"}
            ]
            if worker:
                fields.append({"type": "mrkdwn", "text": f"*Agent:*\n{worker}"})
        else:
            # Other statuses (no-answer, busy, failed, canceled)
            fields = [
                {"type": "mrkdwn", "text": f"*Lead:*\n{lead_display}"},
                {"type": "mrkdwn", "text": f"*State:*\n{display_state}"}
            ]

        # Build message blocks
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {status_message}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": fields
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"Call SID: `{alert.call_sid}`"}
                ]
            }
        ]

        # Add recording link if available (only for completed calls)
        if alert.recording_url and display_status in ('answered', 'completed'):
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":studio_microphone: <{alert.recording_url}|Listen to Recording>"
                }
            })

        payload = {
            "text": f"{status_message}: {alert.from_number} -> {alert.to_number}",
            "blocks": blocks
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(self.webhook_url, json=payload)
                response.raise_for_status()
                logger.info(f"Slack alert sent for call {alert.call_sid}")
                return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to send Slack alert: {e}")
            return False

    def send_custom_message(self, message: str, title: str = "Alert") -> bool:
        """Send a custom message to Slack."""
        if not self.enabled:
            return False

        payload = {
            "text": message,
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": title, "emoji": True}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": message}
                }
            ]
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(self.webhook_url, json=payload)
                response.raise_for_status()
                return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to send Slack message: {e}")
            return False


class AlertManager:
    """
    Central manager for all notification channels.
    Coordinates sending alerts to Slack based on configuration.
    """

    def __init__(self):
        # Initialize Slack notifier
        self.slack = SlackNotifier(Config.SLACK_WEBHOOK_URL)

        # Load alert preferences from config
        self.alert_on_initiated = Config.ALERT_ON_INITIATED
        self.alert_on_ringing = Config.ALERT_ON_RINGING
        self.alert_on_answered = Config.ALERT_ON_ANSWERED
        self.alert_on_completed = Config.ALERT_ON_COMPLETED
        self.alert_on_missed = Config.ALERT_ON_MISSED
        self.alert_on_failed = Config.ALERT_ON_FAILED
        self.alert_on_recording = Config.ALERT_ON_RECORDING

    def should_alert(self, status: str) -> bool:
        """Determine if an alert should be sent based on call status."""
        result = False

        # Starting events
        if status == 'initiated' and self.alert_on_initiated:
            result = True
        elif status == 'ringing' and self.alert_on_ringing:
            result = True
        # In progress / answered
        elif status == 'in-progress' and self.alert_on_answered:
            result = True
        # Completed successfully
        elif status in ('completed', 'answered') and self.alert_on_completed:
            result = True
        # Missed calls (no-answer, busy, canceled)
        elif status in ('no-answer', 'busy', 'canceled') and self.alert_on_missed:
            result = True
        # Failed calls
        elif status == 'failed' and self.alert_on_failed:
            result = True

        print(f"[ALERT DEBUG] should_alert(status={status}) -> {result}")
        return result

    def notify_call_status(self, alert: CallAlert) -> dict:
        """
        Send call status notifications to all configured channels.
        Returns dict with results for each channel.
        Only sends alerts for INBOUND calls.
        """
        results = {'slack': False}

        # Only send Slack alerts for inbound calls
        if alert.direction != 'inbound':
            logger.debug(f"Skipping alert for outbound call: {alert.call_sid}")
            return results

        if not self.should_alert(alert.status):
            logger.debug(f"Skipping alert for status: {alert.status}")
            return results

        # Send to Slack
        if self.slack.enabled:
            results['slack'] = self.slack.send_call_alert(alert)

        return results

    def notify_recording_ready(self, alert: CallAlert) -> dict:
        """Send notification when recording is ready. Only for inbound calls."""
        results = {'slack': False}

        # Only send Slack alerts for inbound calls
        if alert.direction != 'inbound':
            logger.debug(f"Skipping recording alert for outbound call: {alert.call_sid}")
            return results

        if not self.alert_on_recording:
            return results

        if not alert.recording_url:
            return results

        # Send to Slack
        if self.slack.enabled:
            results['slack'] = self.slack.send_call_alert(alert)

        return results

    def send_custom_alert(self, message: str, title: str = "Alert") -> dict:
        """Send a custom alert to all channels."""
        results = {'slack': False}

        if self.slack.enabled:
            results['slack'] = self.slack.send_custom_message(message, title)

        return results


# Singleton instance - will be initialized when app starts
_alert_manager: Optional[AlertManager] = None


def get_alert_manager() -> Optional[AlertManager]:
    """Get the global AlertManager instance."""
    return _alert_manager


def init_alerts() -> AlertManager:
    """Initialize the global AlertManager."""
    global _alert_manager
    _alert_manager = AlertManager()
    logger.info(f"AlertManager initialized - Slack: {_alert_manager.slack.enabled}")
    return _alert_manager
