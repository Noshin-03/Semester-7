"""Consumer-side policy for schema_v1: unlike the strict schema used for
grammar-constrained decoding (additionalProperties: false), a downstream
consumer ignores unknown fields so additive schema changes stay compatible.
Only the required fields and their types are load-bearing here.
"""

from __future__ import annotations

import re
from typing import Any

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DOMAIN_RE = re.compile(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def consumer_validate(record: Any) -> bool:
    if not isinstance(record, dict):
        return False
    if record.get("schema_version") != "1.0":
        return False
    domain = record.get("domain")
    if not isinstance(domain, str) or not DOMAIN_RE.match(domain):
        return False
    if "expires_on" not in record:
        return False
    expires_on = record["expires_on"]
    if expires_on is not None and (not isinstance(expires_on, str) or not DATE_RE.match(expires_on)):
        return False
    return True
