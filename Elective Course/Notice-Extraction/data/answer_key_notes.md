# Answer key: non-obvious judgment calls

Written by hand before any model call, per step 2 of the assignment. Most of
the 50 notices are unambiguous. These are not:

- **n07**: text says `WWW.ShopNest-BD.com`. Key uses the normalized,
  `www.`-stripped, lowercased registrable domain `shopnest-bd.com`, since
  `www.` is a hostname prefix, not part of the registered domain. A model
  that returns the literal string verbatim is arguably also defensible --
  flagged as a known soft spot in scoring, not a hard bug if a model fails it.
- **n02, n09, n11, n20**: date format is ambiguous unless resolved from
  context. n02 and n09 state their format explicitly (`DD/MM/YYYY`,
  `MM/DD/YYYY`). n11 is a German notice (`DD.MM.YYYY` is the only sane
  reading). n20 (`15/08/2027`) has no stated format, but 15 cannot be a
  month, so it resolves to day-first unambiguously.
- **n10**: Bangla notice. Correct reading is "nirjhor.com.bd's term ends on
  20 January 2027" -- Bangla digits/month name, not a transliteration issue.
- **n18, n36, n42**: each notice contains two dates; only one is the
  domain's *current* expiry. n18: previous expiry (4 Dec 2026) vs. new
  expiry after renewal (4 Dec 2027) -- key uses the new one. n36: invoice due
  date (28 Nov) vs. domain expiry (2 Dec) -- key uses domain expiry. n42:
  a price-change effective date (1 Jan 2027) vs. the domain's actual expiry
  (14 Mar 2027) -- key uses domain expiry.
- **n31, n33**: each gives a *suspension* date, not an expiry date. Key
  scores these as `expires_on: null` -- a model that extracts the suspension
  date as if it were the expiry is wrong, even though a date is present in
  the text.
- **n43, n49**: the text names a subdomain/hostname (`blog.saffronkitchen.com`,
  `shop.urbanthreads.com`) that is distinct from the actual registered
  domain. n43's domain is read as the literal hostname (no second domain is
  named). n49 explicitly contrasts "the SSL certificate for
  shop.urbanthreads.com" with "the domain itself", so the key uses
  `urbanthreads.com`.
- **n49**: "the domain itself is registered until 2028" gives only a year,
  not a full date. Per the schema's "never invent a date" rule, this cannot
  be completed to `YYYY-MM-DD`, so `expires_on: null` even though a domain
  expiry (as opposed to the SSL cert's) is clearly referenced.
- **n19, n25, n26, n30, n34, n35, n37, n38, n39, n41, n44, n45, n48, n50**:
  no expiry date for the domain is given at all (pending/processing dates,
  transfer/suspension/lock events, unrelated invoices, surveys, etc.) --
  all scored `expires_on: null`.

All domain values are lowercased for a consistent ground truth, even where
the source text used different casing.
