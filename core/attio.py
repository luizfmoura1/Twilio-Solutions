"""
Attio CRM Integration Service

Provides methods to interact with Attio API for:
- Searching leads/people by phone number
- Logging call notes to records
"""

import requests
import logging
from typing import Optional
from core.config import Config

logger = logging.getLogger(__name__)

ATTIO_API_BASE = "https://api.attio.com/v2"


class AttioClient:
    """Client for Attio CRM API"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or Config.ATTIO_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """Make a request to Attio API"""
        url = f"{ATTIO_API_BASE}{endpoint}"

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"[ATTIO] API request failed: {e}")
            return None

    def list_objects(self) -> list:
        """List all objects in workspace (People, Companies, etc)"""
        result = self._request("GET", "/objects")
        if result:
            return result.get("data", [])
        return []

    def search_person_by_phone(self, phone_number: str) -> Optional[dict]:
        """
        Search for a person/lead by phone number.

        Args:
            phone_number: Phone number to search (any format)

        Returns:
            Lead data dict or None if not found
        """
        # Normalize phone number - remove non-digits except +
        normalized = ''.join(c for c in phone_number if c.isdigit() or c == '+')

        # Try different formats
        search_variants = [normalized]

        # If starts with +1, also try without country code
        if normalized.startswith('+1'):
            search_variants.append(normalized[2:])
        elif normalized.startswith('1') and len(normalized) == 11:
            search_variants.append(normalized[1:])
            search_variants.append(f"+{normalized}")
        elif len(normalized) == 10:
            search_variants.append(f"+1{normalized}")
            search_variants.append(f"1{normalized}")

        # Search in 'people' object
        for variant in search_variants:
            result = self._search_records("people", "phone_numbers", variant)
            if result:
                return self._format_person(result)

        return None

    def _search_records(self, object_slug: str, attribute: str, value: str) -> Optional[dict]:
        """Search records by attribute value"""
        # Attio uses POST for queries
        query_data = {
            "filter": {
                attribute: value
            }
        }

        result = self._request("POST", f"/objects/{object_slug}/records/query", query_data)

        if result and result.get("data"):
            records = result["data"]
            if len(records) > 0:
                return records[0]

        return None

    def _format_person(self, record: dict) -> dict:
        """Format Attio person record to simplified dict"""
        values = record.get("values", {})

        def get_value(field_name):
            """Helper to extract first value from a field"""
            field_data = values.get(field_name, [])
            if field_data and len(field_data) > 0:
                val = field_data[0]
                # Handle different value types
                if isinstance(val, dict):
                    # Try common value keys
                    return val.get("value") or val.get("option") or val.get("text") or val.get("first_name", "")
                return val
            return ""

        # Extract name
        name_data = values.get("name", [])
        name = ""
        if name_data and len(name_data) > 0:
            name_obj = name_data[0]
            first = name_obj.get("first_name", "")
            last = name_obj.get("last_name", "")
            name = f"{first} {last}".strip()

        # Extract primary email
        email_data = values.get("email_addresses", [])
        email = ""
        if email_data and len(email_data) > 0:
            email = email_data[0].get("email_address", "")

        # Extract primary phone
        phone_data = values.get("phone_numbers", [])
        phone = ""
        if phone_data and len(phone_data) > 0:
            phone = phone_data[0].get("phone_number", "")

        # Extract custom fields
        state = get_value("state")
        case_type = get_value("case_type")
        classification = get_value("classification")
        description = get_value("case_description") or get_value("description")
        attorney_info = get_value("attorney_info")
        has_attorney = get_value("attorney")
        city = get_value("city")
        advance_seeking = get_value("advance_seeking")
        advance_value = get_value("advance_value_numeric")  # Numeric value
        workers_comp = get_value("workers_comp")

        return {
            "id": record.get("id", {}).get("record_id", ""),
            "name": name,
            "email": email,
            "phone": phone,
            "state": state,
            "city": city,
            "case_type": case_type,
            "classification": classification,
            "description": description,
            "attorney_info": attorney_info,
            "has_attorney": has_attorney,
            "advance_seeking": advance_seeking,
            "advance_value": advance_value,  # Numeric value
            "workers_comp": workers_comp,
            "raw": record  # Include raw data for debugging
        }

    def search_people(self, query: str = None, limit: int = 100) -> list:
        """
        Search for people/contacts by name or list recent contacts.

        Args:
            query: Optional search string (searches name, email, phone)
            limit: Maximum number of results

        Returns:
            List of formatted person records
        """
        # Build the query - if no query, just list recent records
        query_data = {
            "limit": limit,
            "sorts": [
                {
                    "attribute": "created_at",
                    "direction": "desc"
                }
            ]
        }

        # If there's a search query, add filter
        if query and query.strip():
            # Attio uses contains filter for text search
            # We'll search by name (requires specific filter structure)
            query_data["filter"] = {
                "or": [
                    {"name": {"$contains": query}},
                    {"phone_numbers": {"$contains": query}},
                ]
            }

        result = self._request("POST", "/objects/people/records/query", query_data)

        if result and result.get("data"):
            return [self._format_person_simple(record) for record in result["data"]]

        return []

    def _format_person_simple(self, record: dict) -> dict:
        """Format Attio person record to simplified contact dict"""
        values = record.get("values", {})

        # Extract name
        name_data = values.get("name", [])
        name = ""
        if name_data and len(name_data) > 0:
            name_obj = name_data[0]
            first = name_obj.get("first_name", "")
            last = name_obj.get("last_name", "")
            name = f"{first} {last}".strip()

        # Extract primary phone
        phone_data = values.get("phone_numbers", [])
        phone = ""
        if phone_data and len(phone_data) > 0:
            phone = phone_data[0].get("phone_number", "")

        # Extract state
        state_data = values.get("state", [])
        state = ""
        if state_data and len(state_data) > 0:
            state_obj = state_data[0]
            if isinstance(state_obj, dict):
                state = state_obj.get("option", "") or state_obj.get("value", "")
            else:
                state = str(state_obj)

        return {
            "id": record.get("id", {}).get("record_id", ""),
            "name": name or "Sem nome",
            "phone": phone,
            "state": state,
        }

    def add_note_to_person(self, record_id: str, note_content: str) -> bool:
        """
        Add a note to a person record.

        Args:
            record_id: Attio record ID
            note_content: Note text to add

        Returns:
            True if successful
        """
        data = {
            "data": {
                "parent_object": "people",
                "parent_record_id": record_id,
                "title": "Call Log",
                "content": note_content,
                "format": "plaintext"
            }
        }

        result = self._request("POST", "/notes", data)
        return result is not None


# Singleton instance
_attio_client = None


def get_attio_client() -> Optional[AttioClient]:
    """Get or create Attio client singleton"""
    global _attio_client
    if _attio_client is None:
        if Config.ATTIO_API_KEY:
            _attio_client = AttioClient()
            logger.info("[ATTIO] Client initialized")
        else:
            logger.warning("[ATTIO] No API key configured")
    return _attio_client
