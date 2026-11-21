# Notice extraction: prompt-only vs grammar-constrained

## grammar_constrained
- Invalid rate: mean 0.00%, spread [0.0, 0.0, 0.0]
- Field accuracy: mean 92.67%, spread [0.9267, 0.9267, 0.9267]
- Cost (USD): total 0.009026, per-run [0.003, 0.003, 0.003]

## prompt_only
- Invalid rate: mean 0.00%, spread [0.0, 0.0, 0.0]
- Field accuracy: mean 92.67%, spread [0.9267, 0.9267, 0.9267]
- Cost (USD): total 0.009026, per-run [0.003, 0.003, 0.003]

## Field-level errors (run 1, by method)

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
