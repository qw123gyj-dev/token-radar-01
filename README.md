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

## The model (radar-2)

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x (1 + 0.02 x min(chains - 1, 5)) )
```

The category multiple is calibrated from the snapshot itself: for each category, the
median market-cap-to-TVL ratio of its live-token protocols (each ratio winsorized at
3.0), shrunk toward the global median (0.246) with a prior weight of 8, clamped to
[0.05, 0.80]. No protocol name is special-cased. Rankable means pre-token and not a
wrapped, staked or bridged product of a token that already trades, by the house's own
watchlist rule (see the kit's `input/README.md`): WBTC is Bitcoin on Ethereum, not a
launch still to come.

The implied value and the farm plan are the shared functions in `lib/implied.js` and
`lib/farm.js`, which the dashboard runs too (`dashboard/implied.js`, `dashboard/farm.js`),
so the page and `board.json` cannot disagree. Every farm plan is seven steps, each with
what it costs and how long it takes, derived from the protocol's own category, chains,
TVL and age.

## Built with

Built with an uncensored model on superbot.gg, the free client that keeps the agent
sessions this entry hands in.
