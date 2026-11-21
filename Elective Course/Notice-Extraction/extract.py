"""Runs the Method A (prompt-only) vs Method B (grammar-constrained)
notice-extraction experiment: 50 notices x 2 methods x 3 runs = 300 calls.

Every call goes through agentlab/lm.py so the ledger prices it.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from agentlab.lm import Ledger, OllamaHTTPBackend, run_call

ROOT = Path(__file__).parent
SCHEMA = json.loads((ROOT / "data" / "schema_v1.json").read_text(encoding="utf-8"))
NOTICES = json.loads((ROOT / "data" / "notices.json").read_text(encoding="utf-8"))

SYSTEM_PROMPT = (
    "You extract structured data from a single domain registration notice. "
    "Respond with JSON only, no extra text."
)

PROMPT_ONLY_INSTRUCTIONS = (
    "Extract fields from this notice and return a JSON object with exactly "
    'these keys: "schema_version" (the string "1.0"), "domain" (the domain '
    "name the notice is about -- lowercase, without a leading \"www.\"), "
    'and "expires_on" (the date YOUR domain itself expires or is registered '
    'until, as "YYYY-MM-DD").\n\n'
    "Rules for expires_on:\n"
    "- Use only the domain's own expiry/registration-until date, never an "
    "invoice due date, a suspension date, a price-change effective date, or "
    "an SSL/certificate expiry date mentioned in the same notice.\n"
    "- If the notice gives no such date, or gives only a partial date (for "
    "example just a year), return null. Never invent or guess a date.\n"
    "- If renewal happened and both an old and a new expiry date are given, "
    "use the new (current) one.\n\n"
    "Notice: {text}"
)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DOMAIN_RE = re.compile(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate(record: Any) -> bool:
    """Strict schema-v1 validation (standard-library only, no jsonschema dep)."""
    if not isinstance(record, dict):
        return False
    if set(record.keys()) != {"schema_version", "domain", "expires_on"}:
        return False
    if record.get("schema_version") != "1.0":
        return False
    domain = record.get("domain")
    if not isinstance(domain, str) or not DOMAIN_RE.match(domain):
        return False
    expires_on = record.get("expires_on")
    if expires_on is not None and (not isinstance(expires_on, str) or not DATE_RE.match(expires_on)):
        return False
    return True


def parse_output(raw: str) -> Any:
    """Try to parse raw model output as JSON, forgiving code-fence wrapping."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
        return None


def run_method(backend, ledger: Ledger, *, method: str, run_index: int,
               model: str, use_schema: bool) -> list[dict]:
    rows = []
    for notice in NOTICES:
        prompt = PROMPT_ONLY_INSTRUCTIONS.format(text=notice["text"])
        result = run_call(
            backend, model=model, system_prompt=SYSTEM_PROMPT, prompt=prompt,
            max_tokens=200, format=SCHEMA if use_schema else None,
        )
        parsed = parse_output(result.output)
        valid = validate(parsed)
        ledger.record(method=method, run=run_index, item_id=notice["id"],
                      result=result, valid=valid)
        rows.append({
            "id": notice["id"], "method": method, "run": run_index,
            "raw_output": result.output, "parsed": parsed, "valid": valid,
            "input_tokens": result.input_tokens, "output_tokens": result.output_tokens,
            "cost_usd": result.cost_usd, "latency_s": result.latency_s,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="qwen2.5:3b")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--out-dir", default=str(ROOT / "runs"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    backend = OllamaHTTPBackend()
    ledger = Ledger()
    all_rows = []

    for run_index in range(1, args.runs + 1):
        print(f"[run {run_index}] method A (prompt-only)...")
        all_rows += run_method(backend, ledger, method="prompt_only",
                               run_index=run_index, model=args.model, use_schema=False)
        print(f"[run {run_index}] method B (grammar-constrained)...")
        all_rows += run_method(backend, ledger, method="grammar_constrained",
                               run_index=run_index, model=args.model, use_schema=True)

    (out_dir / "raw_results.jsonl").write_text(
        "\n".join(json.dumps(row, ensure_ascii=False) for row in all_rows) + "\n",
        encoding="utf-8")
    ledger.to_csv(out_dir / "ledger.csv")
    print(f"Wrote {len(all_rows)} rows to {out_dir / 'raw_results.jsonl'}")
    print(f"Wrote ledger to {out_dir / 'ledger.csv'}")


if __name__ == "__main__":
    main()
