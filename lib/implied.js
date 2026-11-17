// The radar's implied-value arithmetic, shared by main.ts and the dashboard page.
//
// One function scores every protocol, from the snapshot's own figures only:
//
//   implied = round( tvl_usd x category_multiple
//                    x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
//                    x (0.6 + min(age_days, 1095) / 1095 x 0.4)
//                    x (1 + 0.02 x min(chains - 1, 5))
//                    x size_multiplier )
//
// category_multiple is the calibration main.ts computes from the snapshot's live-token
// protocols (see lib/model.ts): the median market-cap-to-TVL ratio of live protocols in the
// same category, shrunk toward the global median, clamped to [0.05, 0.80].
//
// size_multiplier is the size curve, also fitted on the snapshot's live-token protocols
// (see lib/model.ts): market cap grows slower than TVL, so a protocol's multiple falls
// as it gets bigger. On the 119 live protocols the log-log slope of the market-cap-to-TVL
// ratio on TVL is -0.50 (market cap itself grows as TVL^0.50), fitted on winsorized
// ratios; the multiplier is exp(slope x (ln tvl - ln ref_tvl)), ref_tvl the median live
// TVL, clamped to [1/32, 32] so no protocol is pushed past thirty-twofold either way.
// On this snapshot the fitted factors run from 0.04 to 2.31, so the clamp never binds;
// it only bounds absurd extrapolation. The curve
// is not a guess: leaving one live protocol out at a time and refitting, it cuts the
// median absolute log error from 1.68 (radar-2) to 1.30. No protocol name is ever
// special-cased, and no row is hand-picked.
//
// UMD: Node imports it as a module, the dashboard loads it as a plain script.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarImplied = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROWTH_FLOOR = -60;
  var GROWTH_CAP = 120;
  var GROWTH_WEIGHT = 0.5;
  var MATURITY_FLOOR = 0.6;
  var MATURITY_RANGE = 0.4;
  var MATURITY_DAYS = 1095;
  var UNKNOWN_AGE_DAYS = 365;
  var CHAIN_STEP = 0.02;
  var CHAIN_MAX = 5;
  var SIZE_CLAMP = 32;

  function clampGrowth(change7d) {
    var g = typeof change7d === 'number' && isFinite(change7d) ? change7d : 0;
    return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, g));
  }

  function growthMultiplier(change7d) {
    return 1 + (clampGrowth(change7d) / 100) * GROWTH_WEIGHT;
  }

  function maturityMultiplier(ageDays) {
    var age = ageDays === null || ageDays === undefined ? UNKNOWN_AGE_DAYS : ageDays;
    return MATURITY_FLOOR + (Math.min(Math.max(age, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  }

  function chainMultiplier(chains) {
    var n = Array.isArray(chains) ? chains.length : 0;
    return 1 + CHAIN_STEP * Math.min(Math.max(n - 1, 0), CHAIN_MAX);
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

  // figures: { tvl_usd, change_7d, age_days, chains, category_multiple, size_multiplier }
  // Returns { implied, growth_pct, growth_multiplier, maturity_multiplier, chain_multiplier, size_multiplier }.
  function impliedValue(figures) {
    var growthPct = clampGrowth(figures.change_7d);
    var growthMult = growthMultiplier(figures.change_7d);
    var maturityMult = maturityMultiplier(figures.age_days);
    var chainMult = chainMultiplier(figures.chains);
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
