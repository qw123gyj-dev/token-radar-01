// The radar's implied-value arithmetic, shared by main.ts and the dashboard page.
//
// One function scores every protocol, from the snapshot's own figures only:
//
//   implied = round( tvl_usd x category_multiple
//                    x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
//                    x (0.6 + min(age_days, 1095) / 1095 x 0.4)
//                    x (1 + 0.02 x min(chains - 1, 5)) )
//
// category_multiple is the calibration main.ts computes from the snapshot's live-token
// protocols (see lib/model.ts): the median market-cap-to-TVL ratio of live protocols in the
// same category, shrunk toward the global median, clamped to [0.05, 0.80]. No protocol name
// is ever special-cased, and no row is hand-picked.
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

  // figures: { tvl_usd, change_7d, age_days, chains, category_multiple }
  // Returns { implied, growth_pct, growth_multiplier, maturity_multiplier, chain_multiplier }.
  function impliedValue(figures) {
    var growthPct = clampGrowth(figures.change_7d);
    var growthMult = growthMultiplier(figures.change_7d);
    var maturityMult = maturityMultiplier(figures.age_days);
    var chainMult = chainMultiplier(figures.chains);
    var multiple = typeof figures.category_multiple === 'number' && isFinite(figures.category_multiple)
      ? figures.category_multiple
      : 0.25;
    var implied = Math.max(1, Math.round(figures.tvl_usd * multiple * growthMult * maturityMult * chainMult));
    return {
      implied: implied,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      chain_multiplier: round4(chainMult),
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
    impliedValue: impliedValue,
    growthMultiplier: growthMultiplier,
    maturityMultiplier: maturityMultiplier,
    chainMultiplier: chainMultiplier,
  };
});
