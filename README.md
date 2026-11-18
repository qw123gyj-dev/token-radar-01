[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/qw123gyj-dev/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/qw123gyj-dev/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

A token launch radar: it ranks pre-token protocols by an implied value and shows how to
farm each one.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot at
`/input/snapshot.json`, scores every rankable pre-token protocol, and writes:

- `board.json` — the ranked board (198 rows: all 40 watchlist protocols plus 158 early
  rows below the watchlist floor; 24 live-token protocols are set aside, not ranked)
- `data.js` — the dashboard's dataset, beside the page
- `dashboard/` — a static page (no framework, no network): sortable and filterable board,
  a detail view per protocol with its model breakdown and farm plan, and a live-token view
- `screenshots/` — board, detail and filtered views, stored as base64 text (`.b64`) so the
  repository stays text-only; `main.ts` decodes them into PNGs when it builds the output
- `dossier.json` — the judge's dossier, written with `buildDossier` from
  `vendor/makefun-board.ts`

Run it with `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>`.

## The model (radar-4)

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 1.0)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x size_multiplier )
```

The category multiple and the size curve are fitted **jointly**, not in two steps as
radar-3 did: the multiples are the medians of the size-adjusted log market-cap-to-TVL
ratios of the snapshot's live-token protocols, shrunk toward the global median (0.311)
with a prior weight of 12, clamped to [0.05, 0.80]; the slope is the
ordinary-least-squares slope of the log ratio on log TVL after the multiples are
removed; the two are alternated until they stop moving (they settle after one pass).
Fitting them apart double-counts: a category's median absorbs the size effect of its
own protocols, and the size slope absorbs the category mix. No protocol name is
special-cased. Rankable means pre-token and not a wrapped, staked or bridged product
of a token that already trades, by the house's own watchlist rule (see the kit's
`input/README.md`): WBTC is Bitcoin on Ethereum, not a launch still to come.

The size multiplier is the size curve: `exp(-0.52 x (ln tvl - ln $27.3M))`, the median
live TVL, clamped to [1/32, 32] (the clamp never binds on this snapshot). Market cap
grows slower than TVL, so the multiple falls as a protocol gets bigger — and the curve
is fitted on the snapshot's own 119 live-token protocols, not asserted.

The chain-count term is gone: under the new fit the blind test says it adds nothing
(adding it back costs 0.02 of leave-one-out median error). The growth weight is 1.0,
not 0.5: the blind test puts the week's move at full weight.

## Blind validation (computed, not claimed)

Every number below is computed by `lib/model.ts` (`validateModel`, `bootstrapRanges`)
from the snapshot's 119 live-token protocols, and the dashboard shows them. Nothing
here was fitted on the protocol it predicts: each fold refits the multiples and the
size slope on its training part only. The headline split (by slug hash) is repeated
on four more independent splits, so the average is not one lucky split.

- **Leave-one-out** (119 folds, median absolute log error): flat global multiple
  1.67, radar-2 (category multiples, no size curve) 1.68, radar-3 1.31,
  **radar-4 1.17**. Mean error: 1.78 / 1.85 / 1.65 / **1.59**. Predictions within 2x
  of the real market cap: 35 / 26 / 35 / **38** of 119. Rank correlation of
  predicted to real market cap: 0.40 / 0.36 / 0.29 / **0.33** — the flat multiple
  ranks slightly better than any model, because the category multiples are noisy
  estimates and shuffle the TVL order; but its values are far off in level, and
  the board ranks by value, so calibration is what the board is for.
- **Five-fold split** (by slug hash, average median error): radar-2 1.65, radar-3
  1.26, **radar-4 1.17** (folds 1.58, 1.15, 0.84, 1.04, 1.22 — fold 0 is worse
  than radar-3's, the other four are better).
- **Five independent five-fold splits** (average of five five-fold averages):
  radar-3 1.31, **radar-4 1.23** (splits 1.17, 1.27, 1.30, 1.25, 1.18).
- **Slope robustness**: joint −0.52, raw pooled −0.50, within-category −0.34, without
  the 5 biggest protocols −0.52, without the 10 biggest −0.44; market cap itself
  grows as TVL^0.47.
- **Ablations** from radar-4 (leave-one-out median error): dropping growth 1.28,
  dropping maturity 1.22, adding the chain-count term back 1.25 (vs 1.17 full).
  Every change makes it worse, so all three are kept as fitted. Growth, maturity
  and chains were near-noise under radar-3; under the joint fit growth earns its
  keep at full weight and chains still do not.
- **What was tried and dropped**: a joint OLS fit (category dummies + log TVL,
  fitted together by least squares) is *worse* out of sample — leave-one-out 1.45,
  five-fold 1.47 — because 33 category dummies on 119 protocols overfit; the
  median-based joint fit is what survives. A Theil–Sen slope is worse too (1.27).
  A size-only model (one global multiple, no categories) has a lower leave-one-out
  median (1.12) but a worse five-fold average (1.29) and worse mean error (1.63);
  a paired bootstrap of the leave-one-out difference gives a 95% interval of
  [−0.24, +0.34], so that gap is noise, while the joint fit wins the mean error,
  the multi-split five-fold and 64 of 119 head-to-head protocols. Dropping the
  categories would also gut the comps premise the bounty asks for.
- **Rank ranges**: 200 bootstrap refits of the calibration (seeded, deterministic)
  give every row a rank range and an implied-value range (10th–90th percentile). The
  top 5 are tight (Steakhouse Financial 1–2, Sentora Curator 2–3, Gauntlet 3–4,
  Polymarket 1–8, Veda 4–7); the median range width across the board is **40 ranks**
  (radar-3: 59) — the joint fit narrows the uncertainty, and the board says what
  is left.
- **Farm verdicts**: each plan's gas ($19–27) and capital ($50–150, 30 days) are
  netted against the low end of its implied-value range. FARM when the rank range sits
  inside the top 40 and breaking even needs under 0.001% of the low-end value; THIN
  when the rank range can still reach the top 40 and breaking even needs under 0.01%;
  SKIP otherwise. On this snapshot: **26 FARM, 34 THIN, 138 SKIP** (radar-3: 18 / 52
  / 128). Gas is never the binding constraint — the median break-even is 0.00049% of
  the low-end value — the rank range is what decides. The verdict is the 8th step of each plan, after the
  7 action steps, which are unchanged.

The implied value and the farm plan are the shared functions in `lib/implied.js` and
`lib/farm.js`, which the dashboard runs too (`dashboard/implied.js`, `dashboard/farm.js`),
so the page and `board.json` cannot disagree — the page recomputes every row it shows,
and all 198 rows recompute to the exact number `board.json` carries. Every farm plan
is eight steps (7 action steps + the verdict step), each 20–600 characters, with what
it costs and how long it takes, derived from the protocol's own category, chains, TVL
and age.

The run is deterministic: two runs of `main.ts` on the same snapshot write byte-identical
output. The dossier is 741,359 bytes with the three screenshots (1280x800 each); the
dashboard source text is 59,360 bytes, inside the 65,536-byte cap.

## Built with

Built with an uncensored model on superbot.gg, the free client that keeps the agent
sessions this entry hands in.
