"""Proof that grammar-constrained decoding is actually doing something.

The main experiment (extract.py) ties prompt-only against grammar-constrained
on every metric, because the main prompt already explicitly instructs
"respond with JSON only" and spells out the schema -- qwen2.5:3b complies
fully even without the constraint, so there's nothing left for it to fix.

To confirm that's the real explanation (and not a bug in how `format` gets
passed to Ollama), this script deliberately uses a WEAK prompt that gives the
model room to answer in free prose instead of JSON. If grammar-constrained
decoding is working, it should still force valid JSON shape here even though
prompt-only does not.
"""

from __future__ import annotations

import json
from pathlib import Path

from agentlab.lm import OllamaHTTPBackend, run_call
from extract import SCHEMA

ROOT = Path(__file__).parent
NOTICES = json.loads((ROOT / "data" / "notices.json").read_text(encoding="utf-8"))

WEAK_SYSTEM_PROMPT = "You are a helpful assistant."
WEAK_PROMPT_TEMPLATE = "Tell me about the domain and expiry date in this message: {text}"


def main() -> None:
    backend = OllamaHTTPBackend()
    for notice in NOTICES[:5]:
        prompt = WEAK_PROMPT_TEMPLATE.format(text=notice["text"])
        prompt_only = run_call(backend, model="qwen2.5:3b", system_prompt=WEAK_SYSTEM_PROMPT,
                                prompt=prompt, max_tokens=200)
        constrained = run_call(backend, model="qwen2.5:3b", system_prompt=WEAK_SYSTEM_PROMPT,
                                prompt=prompt, max_tokens=200, format=SCHEMA)
        print(f"==== {notice['id']} ====")
        print("PROMPT-ONLY :", repr(prompt_only.output[:200]))
        print("CONSTRAINED :", repr(constrained.output[:200]))
        print()


if __name__ == "__main__":
    main()
