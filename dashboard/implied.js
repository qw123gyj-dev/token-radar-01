// The radar's implied-value arithmetic, shared by main.ts and the dashboard page.
//
// One function scores every protocol, from the snapshot's own figures only:
//
//   implied = round( tvl_usd x category_multiple
//                    x (1 + clamp(change_7d, -60, 120) / 100 x 1.0)
//                    x (0.6 + min(age_days, 1095) / 1095 x 0.4)
//                    x size_multiplier )
//
// The radar's implied-value arithmetic, shared by main.ts and the dashboard page.
//
// One function scores every protocol, from the snapshot's own figures only (radar-4):
//
//   implied = round( tvl_usd x category_multiple
//                    x (1 + clamp(change_7d, -60, 120) / 100 x 1.0)
//                    x (0.6 + min(age_days, 1095) / 1095 x 0.4)
//                    x size_multiplier )
//
// The chain-count term is gone in radar-4: the blind test says it adds nothing (adding
// it back costs 0.02 of leave-one-out median error), so the multiplier is 1 and the
// term is not in the formula. The growth weight is 1.0, not 0.5: the blind test puts
// the week's move at full weight (leave-one-out 1.17 at 1.0, 1.22 at 0.5, 1.28 at 0).
//
// category_multiple is the calibration main.ts computes from the snapshot's live-token
// protocols (see lib/model.ts): the median market-cap-to-TVL ratio of live protocols
// in the same category, fitted jointly with the size curve, shrunk toward the global
// median, clamped to [0.05, 0.80].
//
// size_multiplier is the size curve, also fitted on the snapshot's live-token protocols
// (see lib/model.ts): market cap grows slower than TVL, so a protocol's multiple falls
// as it gets bigger. On the 119 live protocols the joint log-log slope of the
// market-cap-to-TVL ratio on TVL is -0.52 (market cap itself grows as TVL^0.48),
// fitted jointly with the category multiples; the multiplier is exp(slope x (ln tvl -
// ln ref_tvl)), ref_tvl the median live TVL, clamped to [1/32, 32] so no protocol is
// pushed past thirty-twofold either way. On this snapshot the fitted factors run from
// 0.09 to 2.43, so the clamp never binds; it only bounds absurd extrapolation. The curve
// is not a guess: leaving one live protocol out at a time and refitting, it cuts the
// median absolute log error from 1.68 (radar-2) to 1.17. No protocol name is ever
// special-cased, and no row is hand-picked.
//
// A caller may pass growth_weight / chain_step in the figures to evaluate a variant
// (the blind test's ablations do); without them the radar-4 constants apply.
//
// UMD: Node imports it as a module, the dashboard loads it as a plain script.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarImplied = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROWTH_FLOOR = -60;
  var GROWTH_CAP = 120;
  var GROWTH_WEIGHT = 1.0;
  var MATURITY_FLOOR = 0.6;
  var MATURITY_RANGE = 0.4;
  var MATURITY_DAYS = 1095;
  var UNKNOWN_AGE_DAYS = 365;
  var CHAIN_STEP = 0;
  var CHAIN_MAX = 5;
  var SIZE_CLAMP = 32;

  function clampGrowth(change7d) {
    var g = typeof change7d === 'number' && isFinite(change7d) ? change7d : 0;
    return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, g));
  }

  function growthMultiplier(change7d, weight) {
    var w = typeof weight === 'number' && isFinite(weight) ? weight : GROWTH_WEIGHT;
    return 1 + (clampGrowth(change7d) / 100) * w;
  }

  function maturityMultiplier(ageDays) {
    var age = ageDays === null || ageDays === undefined ? UNKNOWN_AGE_DAYS : ageDays;
    return MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  }

  function chainMultiplier(chains, step) {
    var s = typeof step === 'number' && isFinite(step) ? step : CHAIN_STEP;
    var n = Array.isArray(chains) ? chains.length : 0;
    return 1 + s * Math.min(Math.max(n - 1, 0), CHAIN_MAX);
  }

  function round4(n) {
    return Math.round(n * 1e4) / 1e4;
  }

  // The size curve: exp(slope x (ln tvl - ln ref_tvl)), clamped to [1/SIZE_CLAMP,
  // SIZE_CLAMP]. slope is negative (about -0.50 on this snapshot), so bigger protocols
  // get a smaller multiple. slope and ref_tvl come from the calibration in lib/model.ts;
  // a caller that passes none gets 1, the radar-2 behaviour.
  function sizeMultiplier(tvlUsd, slope, refTvlUsd) {
    if (typeof slope !== 'number' || !isFinite(slope) || typeof refTvlUsd !== 'number' || !(refTvlUsd > 0) || !(tvlUsd > 0)) return 1;
    var f = slope * (Math.log(tvlUsd) - Math.log(refTvlUsd));
    var cap = Math.log(SIZE_CLAMP);
    if (f > cap) f = cap;
    if (f < -cap) f = -cap;
    return Math.exp(f);
  }

  // figures: { tvl_usd, change_7d, age_days, chains, category_multiple, size_multiplier,
  //   growth_weight?, chain_step? } — the last two are variant overrides for the blind
  //   test's ablations; the board and the page never pass them.
  // Returns { implied, growth_pct, growth_multiplier, maturity_multiplier, chain_multiplier, size_multiplier }.
  function impliedValue(figures) {
    var growthPct = clampGrowth(figures.change_7d);
    var growthMult = growthMultiplier(figures.change_7d, figures.growth_weight);
    var maturityMult = maturityMultiplier(figures.age_days);
    var chainMult = chainMultiplier(figures.chains, figures.chain_step);
    var sizeMult = typeof figures.size_multiplier === 'number' && isFinite(figures.size_multiplier) ? figures.size_multiplier : 1;
    var multiple = typeof figures.category_multiple === 'number' && isFinite(figures.category_multiple)
      ? figures.category_multiple
      : 0.25;
    var implied = Math.max(1, Math.round(figures.tvl_usd * multiple * growthMult * maturityMult * chainMult * sizeMult));
    return {
      implied: implied,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      chain_multiplier: round4(chainMult),
      size_multiplier: round4(sizeMult),
    };
  }

  return {
    GROWTH_FLOOR: GROWTH_FLOOR,
    GROWTH_CAP: GROWTH_CAP,
    GROWTH_WEIGHT: GROWTH_WEIGHT,
    MATURITY_FLOOR: MATURITY_FLOOR,
    MATURITY_RANGE: MATURITY_RANGE,
    MATURITY_DAYS: MATURITY_DAYS,
    UNKNOWN_AGE_DAYS: UNKNOWN_AGE_DAYS,
    SIZE_CLAMP: SIZE_CLAMP,
    impliedValue: impliedValue,
    growthMultiplier: growthMultiplier,
    maturityMultiplier: maturityMultiplier,
    chainMultiplier: chainMultiplier,
    sizeMultiplier: sizeMultiplier,
  };
});
