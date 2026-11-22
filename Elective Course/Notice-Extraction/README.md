# Notice Extraction: Prompt-Only vs Grammar-Constrained

Week 2 assignment (Agentic Software Engineering, Task 2): extract 50 domain
expiry notices into a versioned JSON schema, comparing prompt-only parsing
against schema-constrained decoding, 3 runs each, priced through the Class 1
ledger.

The corpus is a hand-written set of 50 realistic domain-registration emails
(mixed registrars, mixed languages, ambiguous date formats, and several
distractor dates -- invoice due dates, suspension dates, SSL cert expiry --
that are not the domain's own expiry). An earlier, synthetic, one-sentence
corpus (still buildable via `generate_corpus.py`) produced a 100%-valid,
100%-accurate, zero-difference result for both methods on every run --
that corpus turned out to be too easy to differentiate anything. This real
corpus gets a genuine, non-trivial error rate instead.

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
- `generate_corpus.py`: an earlier, synthetic corpus generator (fixed seed
  `42`) kept for reference -- superseded by the hand-written corpus below,
  which exposes real extraction errors instead of a trivial 100%.
- `data/notices.json`: the 50 hand-written domain notices (reused as the
  corpus for Classes 3-6).
- `data/answer_key.json`: the correct `domain`/`expires_on` for each notice,
  written by hand before any model call.
- `data/answer_key_notes.md`: the judgment calls behind every non-obvious
  answer-key entry (ambiguous date formats, distractor dates, subdomain vs.
  registered domain, incomplete dates) -- written for the same reason the
  course asks for honest failure analysis: so a grader (or future you) can
  see the reasoning, not just the verdict.
- `agentlab/lm.py`: the Class 1 wrapper (pulled out of
  `Token-Cost-master/ollama_client.py`) -- the Ollama client, cost/token
  accounting, and the `Ledger` that records tokens, cost and validity per
  call, grouped by method and run.
- `extract.py`: runs Method A (prompt-only, free-text JSON instructions) and
  Method B (grammar-constrained, schema passed via Ollama's `format`) over
  all 50 notices, 3 runs each. Same model, temperature, seed and token limit
  for both methods. Writes `runs/raw_results.jsonl` and `runs/ledger.csv`.
- `score.py`: computes invalid rate and field accuracy per run, then mean and
  min-max spread across the 3 runs, plus total/per-run cost per method, and a
  field-level error breakdown (which notice, which field, got vs. expected).
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

## Result on the real corpus (qwen2.5:3b)

See `runs/report.md` for the full metric table. Both methods: 0% invalid
rate, 89.0% field accuracy (scored on `domain` and `expires_on` --
`schema_version` is excluded since it's a constant, trivially-correct
field), identical cost, on every one of the 3 runs -- and, checked
directly, byte-identical raw output on all 150 matched notice/run pairs
between methods.

That tie is itself the finding: `qwen2.5:3b` at temperature 0 never once
produced malformed JSON under prompt-only instructions, so there was nothing
for grammar-constrained decoding to fix. Constrained decoding only masks
tokens that would break the JSON *shape* -- it has no influence over which
*values* the model picks. All 11 errors (out of 100 scored fields) were
content/semantic mistakes, not structural ones:

- 7 clear, explicitly-labelled expiry dates were skipped entirely (returned
  `null`) on notices that also contained a distractor date (an invoice due
  date, a suspension date, a price-change date) -- the model appears to have
  over-generalized the "ignore distractor dates" instruction and suppressed
  the real one too.
- 1 date had its day and month swapped (`n02`).
- 1 notice kept a subdomain instead of the registered domain, and invented a
  year-only date into a full one, violating the "never invent a date" rule
  (`n49` -- the single hardest case in the corpus).

### Proof the tie isn't a bug

A tie on every metric is a suspicious result at first glance, so it's worth
confirming `format=SCHEMA` is actually constraining anything rather than
being silently ignored. `diagnostic_weak_prompt.py` reruns a handful of
notices with a deliberately weak, JSON-less prompt ("Tell me about the
domain and expiry date in this message: ..."). Under that prompt:

```
==== n01 ====
PROMPT-ONLY : 'The message you provided contains information about a domain
name and its expiration date. Here's a breakdown of the key details:...'
CONSTRAINED : '{ "schema_version": "1.0", "domain": "rahmantraders.com",
"expires_on": "2027-01-14T00:00:00Z" }'
```

Prompt-only answers in free prose with no JSON at all; grammar-constrained
still forces a schema-shaped object. So the constraint mechanism is real --
the main experiment's tie happens because the *actual* prompt in
`extract.py` already explicitly says "respond with JSON only" and spells
out every field, which `qwen2.5:3b` complies with fully even unconstrained.
The two methods only diverge once the prompt is weak enough to let the
model wander -- which is itself a useful, reportable finding: constrained
decoding is a safety net for a weak or careless prompt, not an improvement
on top of an already-strict one.

So: grammar-constrained decoding is a validity guarantee, not an accuracy
guarantee. On a well-aligned small model that already follows JSON
instructions reliably, it buys nothing extra; its value would only show up
against a model (or a prompt) that frequently breaks the output *shape*.
