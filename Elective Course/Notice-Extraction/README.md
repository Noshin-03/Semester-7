# Notice Extraction: Prompt-Only vs Grammar-Constrained

Week 2 assignment (Agentic Software Engineering, Task 2): extract 50 domain
expiry notices into a versioned JSON schema, comparing prompt-only parsing
against schema-constrained decoding, 3 runs each, priced through the Class 1
ledger.

## Requirements

- Python 3.10+
- Ollama running locally (`ollama serve`) with `qwen2.5:3b` pulled

The code uses only Python's standard library.

## Reproduce

```bash
ollama serve                 # if not already running
ollama pull qwen2.5:3b

python3 generate_corpus.py   # rebuilds data/notices.json + data/answer_key.json (fixed seed)
python3 -m unittest discover -s tests -v
python3 -u extract.py --model qwen2.5:3b   # 50 x 2 x 3 = 300 calls
python3 score.py
```

## Files

- `data/schema_v1.json`: strict schema v1 (`additionalProperties: false`),
  used both for validation and as the grammar passed to Ollama's `format`
  field for Method B.
- `contract.py`: the consumer-side validation policy -- lenient on unknown
  fields (additive changes stay compatible), strict on the required fields'
  types (renames/retypes break it). Exercised by
  `tests/test_schema_contract.py`.
- `generate_corpus.py`: builds the 50 synthetic domain-expiry notices and
  their answer key from a fixed seed (`SEED = 42`). Because the corpus is
  synthetic, the generation parameters *are* the hand-checked ground truth --
  no separate manual pass is needed.
- `data/notices.json`, `data/answer_key.json`: the corpus and its answer key
  (reused as the corpus for Classes 3-6).
- `agentlab/lm.py`: the Class 1 wrapper (pulled out of
  `Token-Cost-master/ollama_client.py`) -- the Ollama client, cost/token
  accounting, and the `Ledger` that records tokens, cost and validity per
  call, grouped by method and run.
- `extract.py`: runs Method A (prompt-only, free-text JSON instructions) and
  Method B (grammar-constrained, schema passed via Ollama's `format`) over
  all 50 notices, 3 runs each. Same model, temperature, seed and token limit
  for both methods. Writes `runs/raw_results.jsonl` and `runs/ledger.csv`.
- `score.py`: computes invalid rate and field accuracy per run, then mean and
  min-max spread across the 3 runs, plus total/per-run cost per method.
  Writes `runs/report.json` and `runs/report.md`.
- `tests/test_ledger.py`: tests for the ledger and cost accounting (fake
  backend, no Ollama required).
- `tests/test_schema_contract.py`: the contract test -- one test that accepts
  an additive change (extra `registrar` field) and fails two breaking changes
  (`domain` renamed to `hostname`; `expires_on` changed from string to
  object).

## Methods

- **Method A, prompt-only**: the prompt describes the desired JSON shape;
  the raw output is parsed (tolerating code-fence wrapping) and validated
  against `schema_v1.json`.
- **Method B, grammar-constrained**: identical prompt and model settings,
  but `schema_v1.json` is passed as Ollama's `format` so decoding is
  restricted to it.

## Notes

- KV-cache size computation for Task 1 is in the assignment write-up, not
  this project (no corpus/model dependency there).
- Prices are the course's notional rates ($0.15/M input, $0.60/M output),
  same as Assignment 2's ledger.
