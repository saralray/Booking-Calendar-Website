#!/usr/bin/env python3

import base64
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars"


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def get_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_service_account_credentials() -> tuple[str, str]:
    json_file = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON_FILE", "").strip()
    json_blob = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()

    if json_file:
        payload = json.loads(Path(json_file).read_text(encoding="utf-8"))
        return payload["client_email"], payload["private_key"]

    if json_blob:
        payload = json.loads(json_blob)
        return payload["client_email"], payload["private_key"]

    service_account_email = get_env("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    private_key_pem = get_env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace("\\n", "\n")

    if "BEGIN PRIVATE KEY" not in private_key_pem:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a PEM private key. "
            "Prefer GOOGLE_SERVICE_ACCOUNT_JSON_FILE pointing to the downloaded service-account JSON."
        )

    return service_account_email, private_key_pem


def build_jwt(service_account_email: str, private_key_pem: str) -> str:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim_set = {
        "iss": service_account_email,
        "scope": "https://www.googleapis.com/auth/calendar",
        "aud": TOKEN_URL,
        "exp": now + 3600,
        "iat": now,
    }

    unsigned = ".".join(
        [
            base64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            base64url(json.dumps(claim_set, separators=(",", ":")).encode("utf-8")),
        ]
    )

    private_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"),
        password=None,
    )
    signature = private_key.sign(
        unsigned.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return f"{unsigned}.{base64url(signature)}"


def fetch_access_token(service_account_email: str, private_key_pem: str) -> str:
    assertion = build_jwt(service_account_email, private_key_pem)
    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))
        return payload["access_token"]


def insert_event(calendar_id: str, access_token: str, event_payload: dict) -> dict:
    request = urllib.request.Request(
        f"{CALENDAR_API_BASE}/{urllib.parse.quote(calendar_id, safe='')}/events",
        data=json.dumps(event_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input) if raw_input else {}

        calendar_id = os.environ.get("GOOGLE_CALENDAR_ID", "").strip() or "primary"
        timezone = os.environ.get("GOOGLE_CALENDAR_TIMEZONE", "").strip() or "Asia/Bangkok"
        service_account_email, private_key_pem = load_service_account_credentials()

        for field in ["username", "phone", "reason", "start", "end"]:
            if not payload.get(field):
                raise RuntimeError(f"Missing required field: {field}")

        event_payload = {
            "summary": payload["username"],
            "description": f'{payload["reason"]}\nPhone: {payload["phone"]}',
            "start": {
                "dateTime": payload["start"],
                "timeZone": timezone,
            },
            "end": {
                "dateTime": payload["end"],
                "timeZone": timezone,
            },
        }

        access_token = fetch_access_token(service_account_email, private_key_pem)
        created_event = insert_event(calendar_id, access_token, event_payload)
        sys.stdout.write(json.dumps(created_event))
        return 0
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        sys.stderr.write(detail or str(error))
        return 1
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
