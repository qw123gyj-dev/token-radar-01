// Token Radar's dashboard (radar-5): a dense, decision-first board from window.RADAR —
// KPI strip, snapshot funnel, verdict/deposit/share chips, and a table with launch odds
// and net farm dollars per row, plus a per-protocol detail view. No network: every byte
// it shows is in data.js. Implied value, farm plan and launch odds come from the same
// shared functions main.ts runs (implied.js, farm.js, odds.js), so page and board.json
// cannot disagree: the page recomputes every row and reports mismatches in a hidden
// #selfcheck div. radar-5 keeps the radar-4 value model (joint fit; leave-one-out
// 1.17 vs flat 1.67) and adds launch odds (held-out 70.0% vs 62.5% base rate —
// resemblance, not a forecast), net farm dollars (low-end implied x stated 7% drop
// share, split across TVL by deposit, minus gas), deposit sizing, and a by-time
// holdout (fit pre-2025, test post-2025: 1.14 vs flat 1.71). Rank ranges from 200
// bootstrap refits (median width 40).
// Verdicts: 26 FARM / 34 THIN / 138 SKIP.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var IMPLIED = window.RadarImplied;
  var FARM = window.RadarFarm;
  var ODDS = window.RadarOdds;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, scope: 'all', verdict: 'all', deposit: DATA.deposit_default_usd || 1000, share: DATA.drop_share_default || 0.07 };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtNet(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var s = (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2);
    return s;
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function fmtOdds(n) { return Math.round(n * 100) + '%'; }

  // The model in one call: the page recomputes a row from the snapshot figures and
  // the model constants and checks the number board.json carries. The size multiplier
  // is recomputed from the fitted slope and centre TVL, not read back from the row:
  // the row stores it rounded to 4 decimals, and recomputing from the rounded value
  // would drift from the board by a few dollars.
  function impliedOf(row) {
    return IMPLIED.impliedValue({
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      age_days: row.age_days,
      chains: row.chains,
      category_multiple: row.category_multiple,
      size_multiplier: IMPLIED.sizeMultiplier(row.tvl_usd, DATA.model.size_slope, DATA.model.size_ref_tvl_usd),
    });
  }

  // Launch odds, recomputed exactly as lib/model.ts computes them: the category
  // live-share is the leave-one-out rate for a pre-token member of the category.
  function oddsOf(row) {
    var counts = DATA.odds_model.cat_counts[row.category || 'Other'];
    var rate = DATA.odds_model.global_rate;
    if (counts && counts[1] > 1) rate = counts[0] / (counts[1] - 1);
    return ODDS.round3(ODDS.predict({
      tvl_usd: row.tvl_usd,
      age_days: row.age_days,
      chains: row.chains,
      change_7d: row.change_7d,
      category_rate: rate,
    }, DATA.odds_model));
  }

  function economicsOf(row) {
    return FARM.farmEconomics({
      name: row.name, category: row.category, chains: row.chains, tvl_usd: row.tvl_usd, age_days: row.age_days,
    }, row.implied_lo_usd, row.rank_lo, row.rank_hi, state.deposit, state.share);
  }
  function netOf(row) { return economicsOf(row).net_usd; }

  function verdictBadge(verdict) {
    var cls = verdict === 'FARM' ? 'verdict farm' : verdict === 'THIN' ? 'verdict thin' : 'verdict skip';
    return el('span', { class: cls, text: verdict });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function kv(label, value) {
    var v = typeof value === 'string' ? el('b', { class: 'num', text: value }) : value;
    return el('div', null, el('span', { text: label }), v);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('verdict')) { var vd = params.get('verdict').toUpperCase(); state.verdict = (vd === 'FARM' || vd === 'THIN' || vd === 'SKIP') ? vd : 'all'; }
    if (params.get('deposit')) state.deposit = parseInt(params.get('deposit'), 10) || state.deposit;
    if (params.get('share')) state.share = parseFloat(params.get('share')) || state.share;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.deposit !== (DATA.deposit_default_usd || 1000)) params.set('deposit', String(state.deposit));
    if (state.share !== (DATA.drop_share_default || 0.07)) params.set('share', String(state.share));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function counts() {
    var c = { FARM: 0, THIN: 0, SKIP: 0, watchlist: 0, early: 0 };
    DATA.rows.forEach(function (r) {
      c[r.farm_verdict] = (c[r.farm_verdict] || 0) + 1;
      if (r.watchlist) c.watchlist++; else c.early++;
    });
    return c;
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (state.verdict !== 'all' && r.farm_verdict !== state.verdict) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var pick = {
      name: function (r) { return r.name.toLowerCase(); },
      tvl: function (r) { return r.tvl_usd; },
      growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
      odds: function (r) { return r.launch_odds; },
      net: netOf,
      ranklo: function (r) { return r.rank_lo; },
      farm: function (r) { return { FARM: 0, THIN: 1, SKIP: 2 }[r.farm_verdict]; }
    }[state.sort] || function (r) { return r.implied_value_usd; };
    return list.slice().sort(function (a, b) {
      var av = pick(a), bv = pick(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('div', null,
          el('span', { class: 'brand-name', text: 'TOKEN RADAR' }),
          el('span', { class: 'brand-sub', text: 'Pre-token protocols, ranked by implied value x launch odds' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function kpiStrip() {
    var v = DATA.validation;
    var ov = DATA.odds_validation;
    var c = counts();
    var total = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var top = DATA.rows[0];
    function kpi(label, big, sub) {
      return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { text: big }), el('i', { text: sub }));
    }
    return el('section', { class: 'kpis', 'aria-label': 'Key figures' },
      kpi('Ranked', String(DATA.board_size), DATA.watchlist_size + ' / ' + DATA.watchlist_size + ' watchlist, ' + DATA.early_size + ' early'),
      kpi('Implied value', fmtUsd(total), 'total; rank 1 ' + fmtUsd(top.implied_value_usd)),
      kpi('Blind error', v.loo_radar4.male.toFixed(2), 'median; flat ' + v.loo_flat.male.toFixed(2)),
      kpi('Within 2x', v.loo_radar4.hit_within_2x, 'of live caps within 2x'),
      kpi('Launch odds', Math.round(ov.accuracy * 100) + '%', 'held out; base rate ' + Math.round(ov.base_rate * 100) + '%'),
      kpi('Worth farming', String(c.FARM), c.FARM + ' FARM, ' + c.THIN + ' THIN, ' + c.SKIP + ' SKIP')
    );
  }

  function funnelStrip() {
    var f = DATA.funnel;
    function seg(cls, n, label) {
      return el('i', { class: 'seg ' + cls, style: 'width:' + Math.max(0.5, (n / f.total) * 100) + '%', title: label + ': ' + n });
    }
    function leg(n, label) { return el('span', null, el('b', { text: String(n) }), ' ' + label); }
    return el('section', { class: 'funnel', 'aria-label': 'Snapshot funnel' },
      el('div', { class: 'funnel-bar' },
        seg('ranked', f.ranked, 'Ranked'),
        seg('token', f.token_recorded, 'Record a token'),
        seg('cat', f.excl_category, 'Excluded category'),
        seg('ver', f.excl_versioned, 'Versioned name'),
        seg('wrap', f.excl_wrapped, 'Wrapped or staked')
      ),
      el('div', { class: 'funnel-legend' },
        leg(f.total, 'protocols read'),
        leg(f.ranked, 'ranked here'),
        leg(f.token_recorded, 'record a token'),
        leg(f.excl_category, 'category'),
        leg(f.excl_versioned, 'versioned'),
        leg(f.excl_wrapped, 'wrapped/staked')
      )
    );
  }

  function chip(label, active, onclick) {
    return el('button', { type: 'button', class: 'chip' + (active ? ' on' : ''), 'aria-pressed': active ? 'true' : 'false', text: label, onclick: onclick });
  }
  function chips() {
    var c = counts();
    function set(key, val) { return function () { state[key] = val; writeHash(); render(); }; }
    return el('div', { class: 'chips' },
      chip('All ' + DATA.board_size, state.scope === 'all' && state.verdict === 'all', function () { state.scope = 'all'; state.verdict = 'all'; writeHash(); render(); }),
      chip('Watchlist ' + c.watchlist, state.scope === 'watchlist', set('scope', 'watchlist')),
      chip('Below floor ' + c.early, state.scope === 'early', set('scope', 'early')),
      chip('FARM ' + c.FARM, state.verdict === 'FARM', set('verdict', 'FARM')),
      chip('THIN ' + c.THIN, state.verdict === 'THIN', set('verdict', 'THIN')),
      chip('SKIP ' + c.SKIP, state.verdict === 'SKIP', set('verdict', 'SKIP')),
      el('span', { class: 'chip-label', text: 'Deposit' }),
      chip('$1,000', state.deposit === 1000, set('deposit', 1000)),
      chip('$10,000', state.deposit === 10000, set('deposit', 10000)),
      el('span', { class: 'chip-label', text: 'Drop share' }),
      chip('3.5%', state.share === 0.035, set('share', 0.035)),
      chip('7%', state.share === 0.07, set('share', 0.07)),
      chip('14%', state.share === 0.14, set('share', 0.14))
    );
  }

  function validationStrip() {
    var v = DATA.validation;
    var ov = DATA.odds_validation;
    var ts = v.time_split;
    var widths = DATA.rows.map(function (r) { return r.rank_hi - r.rank_lo; }).sort(function (a, b) { return a - b; });
    var medianWidth = widths[Math.floor(widths.length / 2)];
    return el('section', { class: 'valid-strip' },
      el('h2', { text: 'Blind test — the model was not fitted on what it predicts' }),
      el('p', null,
        'Value model, leave-one-out median error on the snapshot\u2019s ' + v.live_n + ' live-token protocols: ',
        el('b', { text: 'radar-4 ' + v.loo_radar4.male.toFixed(2) }),
        ' vs flat ' + v.loo_flat.male.toFixed(2) + ', radar-2 ' + v.loo_radar2.male.toFixed(2) + ', radar-3 ' + v.loo_radar3.male.toFixed(2) + '; five-fold ' + v.fivefold_radar4_male_avg.toFixed(2) + '; five independent splits ' + v.multi_split_radar4_avg.toFixed(2) + '. Within 2x: flat ' + v.loo_flat.hit_within_2x + ', radar-2 ' + v.loo_radar2.hit_within_2x + ', radar-3 ' + v.loo_radar3.hit_within_2x + ', radar-4 ' + v.loo_radar4.hit_within_2x + '; rank correlation flat ' + v.loo_flat.spearman.toFixed(2) + ' vs radar-4 ' + v.loo_radar4.spearman.toFixed(2) + '.'
      ),
      el('p', null,
        'By time — fitted on live protocols listed before ' + ts.cut + ' (' + ts.train_n + '), tested on the ones listed after (' + ts.test_n + '): radar-4 median error ',
        el('b', { text: ts.radar4.male.toFixed(2) }),
        ' vs flat ' + ts.flat.male.toFixed(2) + ', radar-3 ' + ts.radar3.male.toFixed(2) + '. Launch odds, leave-one-out over ' + ov.n + ' protocols: ',
        el('b', { text: Math.round(ov.accuracy * 100) + '% called right' }),
        ' vs ' + Math.round(ov.base_rate * 100) + '% base rate (' + ov.tp + ' true launches, ' + ov.fp + ' false alarms, ' + ov.fn + ' missed). Every row carries a rank range from 200 refits (median width ' + medianWidth + ').'
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v = DATA.validation;
    var ov = DATA.odds_validation;
    var multiples = Object.keys(m.category_multiples).map(function (c) {
      return { category: c, multiple: m.category_multiples[c] };
    }).sort(function (a, b) { return b.multiple - a.multiple; });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How a row is priced' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No name is special-cased, no row hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x size_multiplier )'
      ),
      el('p', { class: 'sub', text: 'Multiples are the medians of the size-adjusted log market-cap-to-TVL ratios of this snapshot\u2019s live-token protocols, shrunk toward the global median ' + m.global_median + ' with prior weight ' + m.prior + ', clamped to [' + m.multiple_min + ', ' + m.multiple_max + ']; the size slope is refit with the multiples removed, and the two alternate until they stop moving. Fitting them apart double-counts. The size multiplier is exp(' + m.size_slope.toFixed(2) + ' x (ln tvl - ln ' + fmtUsd(m.size_ref_tvl_usd) + ')), clamped to [1/' + m.size_clamp + ', ' + m.size_clamp + ']. No chain term: the blind test says it adds nothing.' }),
      el('div', { class: 'chips' }, multiples.map(function (x) {
        return el('span', { class: 'chip static', text: x.category + ' x' + x.multiple.toFixed(2) });
      })),
      el('h2', { text: 'Blind validation' }),
      el('p', { class: 'sub', text: 'Each fold refits on its training part only; the predicted protocol never trains its own prediction. Error is the absolute log error vs real market cap; lower is better.' }),
      el('p', { class: 'sub', text: 'Five-fold by slug hash, average median error: radar-2 ' + v.fivefold_radar2_male_avg.toFixed(2) + ', radar-3 ' + v.fivefold_radar3_male_avg.toFixed(2) + ', radar-4 ' + v.fivefold_radar4_male_avg.toFixed(2) + '. Four more independent splits: radar-3 ' + v.multi_split_radar3_avg.toFixed(2) + ', radar-4 ' + v.multi_split_radar4_avg.toFixed(2) + '. Ablations from radar-4 (leave-one-out): no growth ' + v.ablation_drop_growth_male.toFixed(2) + ', no maturity ' + v.ablation_drop_maturity_male.toFixed(2) + ', chain term back ' + v.ablation_add_chain_male.toFixed(2) + ' — all worse. The flat multiple ranks slightly better (' + v.loo_flat.spearman.toFixed(2) + ' vs ' + v.loo_radar4.spearman.toFixed(2) + '), but its values are far off in level (1.67 vs 1.17), and the board ranks by value. Rank ranges are the 10th–90th percentiles of ' + v.bootstrap_refits + ' bootstrap refits.' }),
      el('h2', { text: 'Launch odds — resemblance, not a forecast' }),
      el('p', { class: 'sub', text: 'Logistic regression on log TVL, log age, chain count, seven-day change and the leave-one-out category live-share, fitted on 119 live-token vs 198 rankable pre-token protocols. Held out, leave-one-out, it calls ' + Math.round(ov.accuracy * 100) + '% right (' + ov.tp + ' true launches, ' + ov.fp + ' false alarms, ' + ov.fn + ' missed, ' + ov.tn + ' true pre-token) vs a ' + Math.round(ov.base_rate * 100) + '% base rate; mean predicted odds ' + Math.round(ov.mean_prob_live * 100) + '% for protocols that do record a token, ' + Math.round(ov.mean_prob_pre * 100) + '% for ones that do not.' }),
      el('h2', { text: 'Net farm dollars — an assumption, stated' }),
      el('p', { class: 'sub', text: 'Net = low-end implied value x drop share x deposit / TVL - gas. The drop share (default 7%) is an assumption, not a measurement: no snapshot field says what fraction of a launch farmers receive. The FARM / THIN / SKIP verdict does not use the net: it judges the plan\u2019s gas against the low-end implied value and the rank range.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); var again = document.getElementById('q'); if (again) again.focus(); });
    function dropdown(id, label, allText, values, current, key) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: allText }),
        values.map(function (c) { return el('option', { value: c, text: c, selected: c === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { state[key] = s.value; writeHash(); render(); });
      return s;
    }
    var cat = dropdown('category', 'Filter by category', 'All categories', categories, state.category, 'category');
    var chain = dropdown('chain', 'Filter by chain', 'All chains', chains, state.chain, 'chain');
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      search,
      cat,
      chain,
      el('div', { class: 'tabs', 'aria-label': 'Token status' }, pre, live),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function nameCell(r, extra) {
    return el('div', { class: 'name' },
      el('b', { text: r.name }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (extra || '') }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function rankCell(rank) {
    var cls = rank === 1 ? 'rank r1' : rank === 2 ? 'rank r2' : rank === 3 ? 'rank r3' : 'rank';
    return el('span', { class: cls, text: String(rank) });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = (DATA.rows[0] && DATA.rows[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var net = netOf(r);
      var netClass = net >= 0 ? 'pos' : 'neg';
      var odds = oddsOf(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, rankCell(r.rank)),
        el('td', null, nameCell(r, r.watchlist ? ' · watchlist' : '')),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num odds', text: fmtOdds(odds) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'range-sub', text: fmtUsd(r.implied_lo_usd) + '–' + fmtUsd(r.implied_hi_usd) })
        )),
        el('td', { class: 'num ' + netClass, text: fmtNet(net) }),
        el('td', null, verdictBadge(r.farm_verdict))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel board-panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Strongest implied value first. Launch odds are resemblance, not a launch forecast. Net is expected farm dollars at the chosen deposit and share.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Launch odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('net', 'Net $'),
            sortHeader('farm', 'Farm')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, nameCell(r, '')),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the ranking; their market-cap-to-TVL ratios calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Built from the DefiLlama protocol snapshot of ' + DATA.as_of + '. Implied value is this entry\u2019s model, not a price, and not a prediction that a token will be issued: it says what a token would be worth if the protocol\u2019s record stayed as it is. A protocol that records no token may still have one its DefiLlama record does not carry.' }),
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var base = {
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      age_days: row.age_days,
    };
    var economics = FARM.farmEconomics(base, row.implied_lo_usd, row.rank_lo, row.rank_hi, state.deposit, state.share);
    var steps = FARM.farmSteps(base, economics);
    var recomputed = impliedOf(row);
    var odds = oddsOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' - no token recorded' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        kv('TVL', fmtUsd(row.tvl_usd)),
        kv('Category multiple (' + (row.category || 'Other') + ')', fmtMult(row.category_multiple)),
        kv('Seven-day growth', fmtPct(row.change_7d) + ' -> ' + fmtMult(row.growth_multiplier)),
        kv('Age with no token recorded', fmtAge(row.age_days) + ' -> ' + fmtMult(row.maturity_multiplier)),
        kv('Chains (' + (row.chains || []).length + ')', fmtMult(row.chain_multiplier)),
        kv('Size (TVL vs median live ' + fmtUsd(DATA.model.size_ref_tvl_usd) + ')', fmtMult(row.size_multiplier)),
        kv('Rank range (200 refits, 10–90%)', row.rank_lo === row.rank_hi ? String(row.rank_lo) : row.rank_lo + '–' + row.rank_hi),
        kv('Implied-value range (200 refits, 10–90%)', fmtUsd(row.implied_lo_usd) + ' – ' + fmtUsd(row.implied_hi_usd)),
        kv('Implied value', fmtUsd(row.implied_value_usd))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed.implied) + (recomputed.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Launch odds — resemblance, not a forecast' }),
      el('div', { class: 'equation' },
        kv('Launch odds', fmtOdds(odds)),
        kv('Held-out accuracy', Math.round(DATA.odds_validation.accuracy * 100) + '% vs ' + Math.round(DATA.odds_validation.base_rate * 100) + '% base rate')
      ),
      el('p', { class: 'sub', text: 'Logistic regression on log TVL, log age, chain count, seven-day change and the leave-one-out category live-share. The odds say how similar this protocol is to the ones that already record a token — they do not say it will launch one.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        kv('Verdict', verdictBadge(economics.verdict)),
        kv('Deposit', '$' + economics.deposit_usd.toLocaleString('en-US')),
        kv('Drop share (assumed)', Math.round(economics.drop_share * 1000) / 10 + '%'),
        kv('Gas for the whole plan', '$' + economics.gas_usd),
        kv('Capital locked', '$' + economics.capital_usd + ' for ' + economics.hold_days + ' days'),
        kv('Expected net', fmtNet(economics.net_usd)),
        kv('Break-even (gas vs low-end implied value)', economics.break_even_pct.toFixed(6) + '%'),
        kv('Low-end implied value', fmtUsd(row.implied_lo_usd))
      ),
      el('p', { class: 'sub', text: 'Rule: FARM when the rank range sits inside the top 40 and breaking even needs under 0.001% of the low-end value; THIN when the rank range can still reach the top 40 and breaking even needs under 0.01%; SKIP otherwise. Net = low-end implied value x drop share x deposit / TVL - gas; the share is an assumption, not a measurement.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // Self-check: recompute every row the page shows and count the disagreements
  // with board.json. Written into #selfcheck for the headless verification run.
  function selfCheck() {
    var bad = { implied: 0, odds: 0, net: 0, econ: 0, rows: DATA.rows.length };
    DATA.rows.forEach(function (r) {
      if (impliedOf(r).implied !== r.implied_value_usd) bad.implied++;
      if (Math.abs(oddsOf(r) - r.launch_odds) > 0.001) bad.odds++;
      var e = economicsOf(r);
      if (Math.abs(e.net_usd - r.farm_net_usd) > 0.01 && state.deposit === (DATA.deposit_default_usd || 1000) && state.share === (DATA.drop_share_default || 0.07)) bad.net++;
      if (e.verdict !== r.farm_verdict || e.gas_usd !== r.farm_gas_usd) bad.econ++;
    });
    var node = document.getElementById('selfcheck');
    if (node) node.textContent = 'selfcheck implied:' + bad.implied + ' odds:' + bad.odds + ' net:' + bad.net + ' econ:' + bad.econ + ' rows:' + bad.rows;
    return bad;
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(kpiStrip());
    shell.appendChild(funnelStrip());
    shell.appendChild(chips());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(validationStrip());
      shell.appendChild(modelPanel());
    }
    shell.appendChild(footer());
    shell.appendChild(el('div', { id: 'selfcheck', class: 'selfcheck', 'aria-hidden': 'true' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    selfCheck();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
