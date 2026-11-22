# Notice extraction: prompt-only vs grammar-constrained

No prefix/prompt caching was used (every call runs with `keep_alive=0`, per the Class 1 convention of a fresh model state per call), so there is no separate "with prefix cache" cost/time row here -- all costs below already reflect the only mode this experiment ran in.

| Metric (mean, min–max over 3 runs) | prompt | grammar |
|---|---|---|
| Invalid rate | 0.0% (0.0%–0.0%) | 0.0% (0.0%–0.0%) |
| Field accuracy | 89.0% (89.0%–89.0%) | 89.0% (89.0%–89.0%) |
| Field accuracy on valid outputs | 89.0% (89.0%–89.0%) | 89.0% (89.0%–89.0%) |
| Cost per run (USD, notional) | 0.0030 (0.0030–0.0030) | 0.0030 (0.0030–0.0030) |
| Total cost, all runs (USD) | 0.0090 | 0.0090 |
| Seconds per run | 570 (459–777) | 660 (464–782) |
| Refusals / truncated / fenced (all runs) | 0 / 0 / 0 | 0 / 0 / 0 |
| &nbsp;&nbsp;accuracy: domain | 98.0% | 98.0% |
| &nbsp;&nbsp;accuracy: expires_on | 80.0% | 80.0% |

**Note:** prompt-only and grammar-constrained are tied on every metric above because the raw model output was byte-identical between the two methods on every one of the 150 matched notice/run pairs -- `qwen2.5:3b` at temperature 0 never produced malformed JSON under prompt-only instructions, so grammar-constrained decoding (which only restricts token *shape*, not *content*) had nothing left to fix. See `README.md` for the per-notice error analysis.

## Field-level errors (run 1, by method)

### prompt_only (11 field errors out of 100)
- `n02` **expires_on**: got `'2027-05-02'`, expected `'2027-02-05'`
- `n03` **expires_on**: got `None`, expected `'2026-11-02'`
- `n04` **expires_on**: got `None`, expected `'2026-12-31'`
- `n10` **expires_on**: got `None`, expected `'2027-01-20'`
- `n14` **expires_on**: got `None`, expected `'2026-09-20'`
- `n28` **expires_on**: got `None`, expected `'2027-08-30'`
- `n32` **expires_on**: got `None`, expected `'2027-05-21'`
- `n40` **expires_on**: got `None`, expected `'2027-01-01'`
- `n42` **expires_on**: got `None`, expected `'2027-03-14'`
- `n49` **domain**: got `'shop.urbanthreads.com'`, expected `'urbanthreads.com'`
- `n49` **expires_on**: got `'2028-12-31'`, expected `None`

### grammar_constrained (11 field errors out of 100)
- `n02` **expires_on**: got `'2027-05-02'`, expected `'2027-02-05'`
- `n03` **expires_on**: got `None`, expected `'2026-11-02'`
- `n04` **expires_on**: got `None`, expected `'2026-12-31'`
- `n10` **expires_on**: got `None`, expected `'2027-01-20'`
- `n14` **expires_on**: got `None`, expected `'2026-09-20'`
- `n28` **expires_on**: got `None`, expected `'2027-08-30'`
- `n32` **expires_on**: got `None`, expected `'2027-05-21'`
- `n40` **expires_on**: got `None`, expected `'2027-01-01'`
- `n42` **expires_on**: got `None`, expected `'2027-03-14'`
- `n49` **domain**: got `'shop.urbanthreads.com'`, expected `'urbanthreads.com'`
- `n49` **expires_on**: got `'2028-12-31'`, expected `None`
