"""Computes invalid rate, field accuracy and cost per method, with spread
across the 3 runs, from runs/raw_results.jsonl and data/answer_key.json.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).parent
FIELDS = ("schema_version", "domain", "expires_on")


def load_rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def field_accuracy(parsed: dict | None, expected: dict) -> float:
    if not isinstance(parsed, dict):
        return 0.0
    correct = sum(1 for f in FIELDS if parsed.get(f) == expected.get(f))
    return correct / len(FIELDS)


def summarize(values: list[float]) -> dict:
    return {
        "mean": round(statistics.mean(values), 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "per_run": [round(v, 4) for v in values],
    }


def field_errors(rows: list[dict], answer_key: dict, method: str, run: int) -> list[dict]:
    errors = []
    for r in rows:
        if r["method"] != method or r["run"] != run:
            continue
        expected = answer_key[r["id"]]
        parsed = r["parsed"] or {}
        for f in ("domain", "expires_on"):
            if parsed.get(f) != expected.get(f):
                errors.append({"id": r["id"], "field": f,
                               "got": parsed.get(f), "expected": expected.get(f)})
    return errors


def main() -> None:
    rows = load_rows(ROOT / "runs" / "raw_results.jsonl")
    answer_key = json.loads((ROOT / "data" / "answer_key.json").read_text(encoding="utf-8"))

    methods = sorted({r["method"] for r in rows})
    runs = sorted({r["run"] for r in rows})
    report: dict = {}

    for method in methods:
        invalid_rates, accuracies, costs = [], [], []
        for run in runs:
            run_rows = [r for r in rows if r["method"] == method and r["run"] == run]
            if not run_rows:
                continue
            invalid = sum(1 for r in run_rows if not r["valid"])
            invalid_rates.append(invalid / len(run_rows))
            accs = [field_accuracy(r["parsed"], answer_key[r["id"]]) for r in run_rows]
            accuracies.append(statistics.mean(accs))
            costs.append(sum(r["cost_usd"] for r in run_rows))
        report[method] = {
            "invalid_rate": summarize(invalid_rates),
            "field_accuracy": summarize(accuracies),
            "cost_usd": summarize(costs),
            "total_cost_usd": round(sum(costs), 6),
        }

    (ROOT / "runs" / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")

    lines = ["# Notice extraction: prompt-only vs grammar-constrained", ""]
    for method, stats in report.items():
        lines.append(f"## {method}")
        lines.append(f"- Invalid rate: mean {stats['invalid_rate']['mean']:.2%}, "
                      f"spread {stats['invalid_rate']['per_run']}")
        lines.append(f"- Field accuracy: mean {stats['field_accuracy']['mean']:.2%}, "
                      f"spread {stats['field_accuracy']['per_run']}")
        lines.append(f"- Cost (USD): total {stats['total_cost_usd']}, "
                      f"per-run {stats['cost_usd']['per_run']}")
        lines.append("")

    lines.append("## Field-level errors (run 1, by method)")
    lines.append("")
    scored_fields = len(answer_key) * 2  # domain + expires_on per notice
    for method in methods:
        errors = field_errors(rows, answer_key, method, runs[0])
        lines.append(f"### {method} ({len(errors)} field errors out of {scored_fields})")
        for e in errors:
            lines.append(f"- `{e['id']}` **{e['field']}**: got `{e['got']!r}`, expected `{e['expected']!r}`")
        lines.append("")
    (ROOT / "runs" / "report.md").write_text("\n".join(lines), encoding="utf-8")

    print("\n".join(lines))


if __name__ == "__main__":
    main()
