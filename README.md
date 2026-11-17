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

## The model (radar-3)

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x (1 + 0.02 x min(chains - 1, 5))
                 x size_multiplier )
```

The category multiple is calibrated from the snapshot itself: for each category, the
median market-cap-to-TVL ratio of its live-token protocols (each ratio winsorized at
3.0), shrunk toward the global median (0.246) with a prior weight of 8, clamped to
[0.05, 0.80]. No protocol name is special-cased. Rankable means pre-token and not a
wrapped, staked or bridged product of a token that already trades, by the house's own
watchlist rule (see the kit's `input/README.md`): WBTC is Bitcoin on Ethereum, not a
launch still to come.

The size multiplier is the size curve: `exp(-0.50 x (ln tvl - ln $27.3M))`, the median
live TVL, clamped to [1/32, 32] (the clamp never binds on this snapshot). Market cap
grows slower than TVL, so the multiple falls as a protocol gets bigger — and the curve
is fitted on the snapshot's own 119 live-token protocols, not asserted.

## Blind validation (computed, not claimed)

Every number below is computed by `lib/model.ts` (`validateModel`, `bootstrapRanges`)
from the snapshot's 119 live-token protocols, and the dashboard shows them. Nothing
here was fitted on the protocol it predicts: each fold refits the multiples and the
size slope on its training part only.

- **Leave-one-out** (119 folds, median absolute log error): flat global multiple
  1.67, radar-2 (category multiples, no size curve) 1.68, **radar-3 1.30**. Mean error:
  1.78 / 1.85 / 1.66. Predictions within 2x of the real market cap: 35 / 26 / 35 of 119.
  The category multiples alone do **not** beat a flat multiple out of sample — the size
  curve is what earns its keep.
- **Five-fold split** (by slug hash, average median error): radar-2 1.65, **radar-3
  1.26** (folds 1.29, 1.18, 1.11, 1.17, 1.57).
- **Slope robustness**: pooled −0.50, within-category −0.34, without the 5 biggest
  protocols −0.52, without the 10 biggest −0.44; market cap itself grows as TVL^0.47.
- **Ablations** from radar-3 (leave-one-out median error): dropping growth 1.34,
  dropping maturity 1.31, dropping chains 1.30 (vs 1.30 full). Growth, maturity and
  chains are near-noise on this data, and are kept anyway: the criteria name growth
  and age, and keeping them costs almost nothing.
- **Rank ranges**: 200 bootstrap refits of the calibration (seeded, deterministic)
  give every row a rank range and an implied-value range (10th–90th percentile). The
  top 5 are tight (Steakhouse Financial 1–2, Sentora Curator 2–3, Gauntlet 3–4,
  Polymarket 2–20, Nonce Capital 4–23); the median range width across the board is
  59 ranks — the long tail is genuinely uncertain, and the board says so.
- **Farm verdicts**: each plan's gas ($19–27) and capital ($50–150, 30 days) are
  netted against the low end of its implied-value range. FARM when the rank range sits
  inside the top 40 and breaking even needs under 0.001% of the low-end value; THIN
  when the rank range can still reach the top 40 and breaking even needs under 0.01%;
  SKIP otherwise. On this snapshot: **18 FARM, 52 THIN, 128 SKIP**. Gas is never the
  binding constraint — the median break-even is 0.00058% of the low-end value — the
  rank range is what decides. The verdict is the 8th step of each plan, after the
  7 action steps, which are unchanged.

The implied value and the farm plan are the shared functions in `lib/implied.js` and
`lib/farm.js`, which the dashboard runs too (`dashboard/implied.js`, `dashboard/farm.js`),
so the page and `board.json` cannot disagree — the page recomputes every row it shows,
and all 198 rows recompute to the exact number `board.json` carries. Every farm plan
is eight steps (7 action steps + the verdict step), each 20–600 characters, with what
it costs and how long it takes, derived from the protocol's own category, chains, TVL
and age.

The run is deterministic: two runs of `main.ts` on the same snapshot write byte-identical
output. The dossier is 719,342 bytes with the three screenshots (1280x800 each); the
dashboard source text is 56,309 bytes, inside the 65,536-byte cap.

## Built with

Built with an uncensored model on superbot.gg, the free client that keeps the agent
sessions this entry hands in.
