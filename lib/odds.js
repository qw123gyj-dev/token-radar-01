// Launch odds (radar-5): how similar a protocol is to protocols that already record
// a token. Logistic regression on [1, ln tvl, ln(age+1), chains, clamped 7d change,
// category live-share], standardised, IRLS, ridge 1; the category rate is
// leave-one-out (a protocol never counts itself). Held out (leave-one-out, 119 live
// vs 198 rankable pre-token): 70.0% right vs a 62.5% base rate; mean odds 57.1% for
// live-token protocols, 30.0% for pre-token ones. Resemblance, not a forecast.
// Age unknown uses 365 days. UMD: the dashboard loads it with implied.js, farm.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarOdds = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNKNOWN_AGE_DAYS = 365;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // Raw features: [1, ln tvl, ln(age + 1), chains, clamped 7d change, category live-share].
  // ageDays null (no listing date reported) uses 365 days.
  function features(figures) {
    var age = figures.age_days === null || figures.age_days === undefined ? UNKNOWN_AGE_DAYS : figures.age_days;
    return [
      1,
      Math.log(Math.max(figures.tvl_usd, 1)),
      Math.log(Math.max(age, 0) + 1),
      Array.isArray(figures.chains) ? figures.chains.length : 0,
      clamp(typeof figures.change_7d === 'number' && isFinite(figures.change_7d) ? figures.change_7d : 0, -60, 120) / 100,
      typeof figures.category_rate === 'number' && isFinite(figures.category_rate) ? figures.category_rate : 0,
    ];
  }

  // The model's prediction for one feature vector: standardize with the fitted
  // means and deviations, dot with the fitted weights, sigmoid. model carries
  // { weights, mu, sd } from lib/model.ts.
  function predictFromFeatures(x, model) {
    var s = model.weights[0];
    for (var j = 1; j < x.length; j++) s += model.weights[j] * ((x[j] - model.mu[j]) / model.sd[j]);
    if (s >= 0) return 1 / (1 + Math.exp(-s));
    var e = Math.exp(s);
    return e / (1 + e);
  }

  function predict(figures, model) {
    return predictFromFeatures(features(figures), model);
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  return {
    UNKNOWN_AGE_DAYS: UNKNOWN_AGE_DAYS,
    features: features,
    predictFromFeatures: predictFromFeatures,
    predict: predict,
    round3: round3,
  };
});
