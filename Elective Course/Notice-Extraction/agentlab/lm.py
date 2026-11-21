"""Class 1 wrapper: minimal Ollama client plus a ledger that records tokens
and notional cost per call.

Pulled out of Token-Cost-master/ollama_client.py so it can be reused across
assignments (as suggested by the Lecture-01 brief, which names this module
agentlab/lm.py).
"""

from __future__ import annotations

import csv
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.request import Request, urlopen

INPUT_PRICE_PER_MILLION = 0.15
OUTPUT_PRICE_PER_MILLION = 0.60


class ChatBackend(Protocol):
    def chat(self, *, model: str, messages: list[dict[str, str]],
             options: dict[str, Any], keep_alive: int | str,
             format: Any | None) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class CallResult:
    output: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_s: float


def cost_usd(input_tokens: int, output_tokens: int) -> float:
    """Return the course-notional cost for Ollama token counts."""
    return (input_tokens * INPUT_PRICE_PER_MILLION
            + output_tokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000


def result_from_response(response: dict[str, Any], latency_s: float) -> CallResult:
    """Convert one Ollama response into a validated, costed result."""
    try:
        message = response["message"]
        output = message["content"]
        input_tokens = response["prompt_eval_count"]
        output_tokens = response["eval_count"]
    except (KeyError, TypeError) as exc:
        raise ValueError("Ollama response lacks message/count fields") from exc
    if not isinstance(output, str) or not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
        raise ValueError("Ollama response contains invalid output or token types")
    return CallResult(output, input_tokens, output_tokens,
                      cost_usd(input_tokens, output_tokens), latency_s)


class OllamaHTTPBackend:
    """Minimal backend for Ollama's local /api/chat endpoint."""

    def __init__(self, base_url: str = "http://localhost:11434") -> None:
        self.url = base_url.rstrip("/") + "/api/chat"

    def chat(self, *, model: str, messages: list[dict[str, str]],
             options: dict[str, Any], keep_alive: int | str = 0,
             format: Any | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "keep_alive": keep_alive,
            "options": options,
        }
        if format is not None:
            payload["format"] = format
        request = Request(self.url, data=json.dumps(payload).encode("utf-8"),
                          headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urlopen(request, timeout=600) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise RuntimeError(f"Ollama request failed at {self.url}: {exc}") from exc


def run_call(backend: ChatBackend, *, model: str, system_prompt: str,
             prompt: str, temperature: float = 0.0, seed: int = 42,
             max_tokens: int = 256, keep_alive: int | str = 0,
             format: Any | None = None) -> CallResult:
    """Run one independent chat call and return Ollama counts plus cost."""
    if max_tokens <= 0:
        raise ValueError("max_tokens must be positive")
    started = time.perf_counter()
    response = backend.chat(
        model=model,
        messages=[{"role": "system", "content": system_prompt},
                  {"role": "user", "content": prompt}],
        options={"temperature": temperature, "seed": seed, "num_predict": max_tokens},
        keep_alive=keep_alive,
        format=format,
    )
    return result_from_response(response, time.perf_counter() - started)


@dataclass
class LedgerEntry:
    method: str
    run: int
    item_id: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_s: float
    valid: bool


@dataclass
class Ledger:
    """Records tokens, cost and validity for every call, grouped by method/run."""

    entries: list[LedgerEntry] = field(default_factory=list)

    def record(self, *, method: str, run: int, item_id: str,
               result: CallResult, valid: bool) -> None:
        self.entries.append(LedgerEntry(
            method=method, run=run, item_id=item_id,
            input_tokens=result.input_tokens, output_tokens=result.output_tokens,
            cost_usd=result.cost_usd, latency_s=result.latency_s, valid=valid,
        ))

    def total_cost(self, method: str | None = None, run: int | None = None) -> float:
        return sum(e.cost_usd for e in self._filtered(method, run))

    def total_tokens(self, method: str | None = None, run: int | None = None) -> int:
        return sum(e.input_tokens + e.output_tokens for e in self._filtered(method, run))

    def _filtered(self, method: str | None, run: int | None) -> list[LedgerEntry]:
        rows = self.entries
        if method is not None:
            rows = [e for e in rows if e.method == method]
        if run is not None:
            rows = [e for e in rows if e.run == run]
        return rows

    def to_csv(self, path: Path) -> None:
        with open(path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["method", "run", "item_id", "input_tokens",
                             "output_tokens", "cost_usd", "latency_s", "valid"])
            for e in self.entries:
                writer.writerow([e.method, e.run, e.item_id, e.input_tokens,
                                 e.output_tokens, e.cost_usd, e.latency_s, e.valid])
