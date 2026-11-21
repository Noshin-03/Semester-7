"""Builds the 50-notice corpus and its hand-checkable answer key.

Notices are synthetic, generated from a fixed random seed so the corpus is
reproducible (python generate_corpus.py rebuilds the same files). Because the
generator controls domain/date/phrasing, the "answer key" is simply the
generation parameters recorded before any model call is made -- the synthetic
equivalent of writing the correct fields by hand, per the assignment's step 2.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 42
COUNT = 50
OUT_DIR = Path(__file__).parent / "data"

TLDS = ["com", "net", "org", "io", "dev", "co", "app", "info"]
WORDS = [
    "example", "northwind", "bluehaven", "pixelforge", "quietriver",
    "copperfield", "lanternbay", "maplecourt", "stonebridge", "fernwood",
    "harborlight", "brightfield", "cinderoak", "goldenreed", "silvermoss",
    "thistledown", "amberline", "wrenfield", "cobaltpeak", "willowmere",
]

DATED_TEMPLATES = [
    "{domain} expires on {date_long}.",
    "Your registration for {domain} will expire on {date_iso}.",
    "Notice: the domain {domain} is set to expire {date_long}.",
    "This is a reminder that {domain} expires {date_long}. Renew soon to avoid losing it.",
    "Domain expiry notice -- {domain}: expiration date {date_iso}.",
    "{domain} (registered under our standard plan) will lapse on {date_long} unless renewed.",
    "Heads up: {domain} is due to expire on {date_long}. Registrar: NameVault Inc.",
    "ACTION REQUIRED: {domain} expires {date_iso}. Please log in to renew.",
    "The current term for {domain} ends on {date_long}, after which the domain enters redemption.",
    "{domain} -- expiry {date_iso}. Auto-renew is currently OFF for this domain.",
]

UNDATED_TEMPLATES = [
    "{domain} registration status: active. No expiry date is listed on file.",
    "We could not find an expiration date for {domain} in our records.",
    "{domain} was renewed recently; the next expiry date has not yet been assigned.",
    "Notice regarding {domain}: ownership verified. Expiry information pending.",
    "{domain} is currently in a grace period with an undetermined new expiry date.",
]


def random_domain(rng: random.Random, used: set[str]) -> str:
    while True:
        name = rng.choice(WORDS)
        tld = rng.choice(TLDS)
        domain = f"{name}.{tld}"
        if domain not in used:
            used.add(domain)
            return domain


def random_date(rng: random.Random) -> date:
    start = date(2026, 1, 1)
    offset = rng.randint(0, 1095)
    return start + timedelta(days=offset)


def format_long(d: date) -> str:
    return d.strftime("%d %B %Y").lstrip("0")


def build_corpus() -> tuple[list[dict], dict[str, dict]]:
    rng = random.Random(SEED)
    used_domains: set[str] = set()
    notices: list[dict] = []
    answer_key: dict[str, dict] = {}

    undated_ids = set(rng.sample(range(1, COUNT + 1), k=5))

    for i in range(1, COUNT + 1):
        domain = random_domain(rng, used_domains)
        item_id = str(i)
        if i in undated_ids:
            template = rng.choice(UNDATED_TEMPLATES)
            text = template.format(domain=domain)
            expires_on = None
        else:
            d = random_date(rng)
            template = rng.choice(DATED_TEMPLATES)
            text = template.format(domain=domain, date_long=format_long(d),
                                    date_iso=d.isoformat())
            expires_on = d.isoformat()
        notices.append({"id": item_id, "text": text})
        answer_key[item_id] = {
            "schema_version": "1.0",
            "domain": domain,
            "expires_on": expires_on,
        }
    return notices, answer_key


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    notices, answer_key = build_corpus()
    (OUT_DIR / "notices.json").write_text(
        json.dumps(notices, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT_DIR / "answer_key.json").write_text(
        json.dumps(answer_key, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(notices)} notices to {OUT_DIR / 'notices.json'}")
    print(f"Wrote answer key to {OUT_DIR / 'answer_key.json'}")


if __name__ == "__main__":
    main()
