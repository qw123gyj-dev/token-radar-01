// Token Radar's dashboard (radar-4). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol detail
// view with the model's own inputs and the protocol's farm plan. No network: every byte
// it shows is in data.js. The implied value and the farm plan come from the same shared
// functions main.ts runs (implied.js, farm.js), so the page and board.json cannot disagree.
//
// Blind validation, computed from the snapshot's 119 live-token protocols by main.ts
// (lib/model.ts validateModel) and carried in DATA.validation — nothing here is fitted
// on the protocol it predicts: leave-one-out median absolute log error 1.17 for radar-4
// (flat multiple 1.67, radar-2 1.68, radar-3 1.31); five-fold average 1.17 (radar-3
// 1.26); five independent five-fold splits average 1.23 (radar-3 1.31); predictions
// within 2x of the real market cap 38/119 (flat 35/119, radar-2 26/119, radar-3 35/119).
// The size curve's joint slope is -0.52 (the raw slope -0.50, within-category -0.34,
// without the 5 biggest protocols -0.52; market cap itself grows as TVL^0.47). Every
// row's rank range and implied-value range come from 200 bootstrap refits of the
// calibration; the median rank range is 40 wide. Every farm plan is netted to a
// break-even and a FARM / THIN / SKIP verdict (26 / 34 / 138 on this snapshot).
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var IMPLIED = window.RadarImplied;
  var FARM = window.RadarFarm;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
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
  function fmtMult(n) {
    return 'x' + n.toFixed(2);
  }

  // The model in one call: the page recomputes a row from the snapshot figures and the
  // model constants and checks the number board.json carries, so the page's code and the
  // board's data are visibly the same arithmetic. The size multiplier is recomputed
  // from the fitted slope and centre TVL, not read back from the row: the row stores
  // it rounded to 4 decimals for display, and recomputing from the rounded value
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

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'ranklo') { av = a.rank_lo; bv = b.rank_lo; }
      else if (key === 'farm') { var order = { FARM: 0, THIN: 1, SKIP: 2 }; av = order[a.farm_verdict]; bv = order[b.farm_verdict]; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
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
          el('span', { class: 'brand-sub', text: 'Pre-token protocols, ranked by implied value' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what a launch would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. Wrapped, staked and bridged products of tokens that already trade are left out — WBTC is Bitcoin on Ethereum, not a launch still to come — and the early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, so the board holds all ' + DATA.board_size + ' rankable pre-token protocols in the snapshot. Implied value is a model, not a price, and not a promise that a token will be issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function validationStrip() {
    var v = DATA.validation;
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { counts[r.farm_verdict] = (counts[r.farm_verdict] || 0) + 1; });
    var widths = DATA.rows.map(function (r) { return r.rank_hi - r.rank_lo; }).sort(function (a, b) { return a - b; });
    var medianWidth = widths[Math.floor(widths.length / 2)];
    return el('section', { class: 'valid-strip' },
      el('h2', { text: 'Blind test — the model was not fitted on what it predicts' }),
      el('p', null,
        'On the snapshot\u2019s ' + v.live_n + ' live-token protocols, each refit on the training part only: leave-one-out median error ',
        el('b', { text: 'radar-4 ' + v.loo_radar4.male.toFixed(2) }),
        ' vs flat multiple ' + v.loo_flat.male.toFixed(2) + ' vs radar-2 ' + v.loo_radar2.male.toFixed(2) + ' vs radar-3 ' + v.loo_radar3.male.toFixed(2) + '; five-fold average ',
        el('b', { text: v.fivefold_radar4_male_avg.toFixed(2) }),
        ' vs ' + v.fivefold_radar3_male_avg.toFixed(2) + '; five independent five-fold splits average ' + v.multi_split_radar4_avg.toFixed(2) + ' vs ' + v.multi_split_radar3_avg.toFixed(2) + '. Within 2x of the real market cap: ' + v.loo_radar4.hit_within_2x + ' (flat ' + v.loo_flat.hit_within_2x + ', radar-2 ' + v.loo_radar2.hit_within_2x + ', radar-3 ' + v.loo_radar3.hit_within_2x + '). Size slope ' + v.joint_slope.toFixed(2) + ' (raw ' + v.slope.toFixed(2) + ', within-category ' + v.slope_within_category.toFixed(2) + '; without the 5 biggest ' + v.slope_excl_top5_tvl.toFixed(2) + '). Every row carries a rank range from 200 refits (median width ' + medianWidth + ') and a farm verdict: ' + counts.FARM + ' FARM, ' + counts.THIN + ' THIN, ' + counts.SKIP + ' SKIP.'
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v = DATA.validation;
    var multiples = Object.keys(m.category_multiples).map(function (c) {
      return { category: c, multiple: m.category_multiples[c] };
    }).sort(function (a, b) { return b.multiple - a.multiple; });
    function scoreRow(label, s) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: s.male.toFixed(2) }),
        el('td', { class: 'num', text: s.mean_abs_log_error.toFixed(2) }),
        el('td', { class: 'num', text: s.hit_within_2x }),
        el('td', { class: 'num', text: (s.spearman === undefined ? '—' : s.spearman.toFixed(2)) })
      );
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x size_multiplier )'
      ),
      el('p', { class: 'sub', text: 'The category multiple and the size curve are fitted jointly, not in two steps: the multiples are the medians of the size-adjusted log market-cap-to-TVL ratios of this snapshot\u2019s live-token protocols, shrunk toward the global median ' + m.global_median + ' with a prior weight of ' + m.prior + ', clamped to [' + m.multiple_min + ', ' + m.multiple_max + ']; the size slope is then refit on the log ratios with the multiples removed, and the two are alternated until they stop moving. Fitting them apart double-counts: a category\u2019s median absorbs the size effect of its own protocols, and the size slope absorbs the category mix. A category with no live protocol in the snapshot uses the global median. Age is the time since the protocol was first listed, the best record of how long it has run with no token recorded; an unlisted age uses ' + m.unknown_age_days + ' days. There is no chain-count term in radar-4: the blind test says it adds nothing, and putting it back costs 0.02 of leave-one-out median error.' }),
      el('p', { class: 'sub', text: 'The size multiplier is exp(' + m.size_slope.toFixed(2) + ' x (ln tvl - ln ' + fmtUsd(m.size_ref_tvl_usd) + ')), the median live TVL, clamped to [1/' + m.size_clamp + ', ' + m.size_clamp + '] — the clamp never binds on this snapshot, it only bounds absurd extrapolation. Market cap grows slower than TVL: the joint slope is ' + m.size_slope.toFixed(2) + ', so market cap itself grows as TVL^' + v.slope_direct_loglog.toFixed(2) + '. The raw slope fitted apart is ' + v.slope.toFixed(2) + '; within categories ' + v.slope_within_category.toFixed(2) + '; without the 5 biggest protocols ' + v.slope_excl_top5_tvl.toFixed(2) + ', without the 10 biggest ' + v.slope_excl_top10_tvl.toFixed(2) + '.' }),
      el('div', { class: 'chips' }, multiples.map(function (x) {
        return el('span', { class: 'chip', text: x.category + ' x' + x.multiple.toFixed(2) });
      })),
      el('h2', { text: 'Blind validation' }),
      el('p', { class: 'sub', text: 'Each fold refits the multiples and the size slope on its training part only; the protocol (or fold) being predicted never trains its own prediction. Error is the absolute log error of predicted vs real market cap; lower is better.' }),
      el('table', { class: 'valid-table' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Model' }),
          el('th', { scope: 'col', class: 'num', text: 'Median error' }),
          el('th', { scope: 'col', class: 'num', text: 'Mean error' }),
          el('th', { scope: 'col', class: 'num', text: 'Within 2x' }),
          el('th', { scope: 'col', class: 'num', text: 'Rank corr.' })
        )),
        el('tbody', null,
          scoreRow('Flat global multiple (leave-one-out)', v.loo_flat),
          scoreRow('radar-2, category multiples (leave-one-out)', v.loo_radar2),
          scoreRow('radar-3, category + size curve, fitted apart (leave-one-out)', v.loo_radar3),
          scoreRow('radar-4, joint fit (leave-one-out)', v.loo_radar4)
        )
      ),
      el('p', { class: 'sub', text: 'Five-fold split by slug hash, average median error: radar-2 ' + v.fivefold_radar2_male_avg.toFixed(2) + ', radar-3 ' + v.fivefold_radar3_male_avg.toFixed(2) + ', radar-4 ' + v.fivefold_radar4_male_avg.toFixed(2) + ' (folds ' + v.fivefold_radar4_male_folds.map(function (x) { return x.toFixed(2); }).join(', ') + '). The split is repeated on four more independent slug-hash splits: five-split averages radar-3 ' + v.multi_split_radar3_avg.toFixed(2) + ' (' + v.multi_split_radar3_splits.map(function (x) { return x.toFixed(2); }).join(', ') + '), radar-4 ' + v.multi_split_radar4_avg.toFixed(2) + ' (' + v.multi_split_radar4_splits.map(function (x) { return x.toFixed(2); }).join(', ') + '), so the gap is not one lucky split. Ablations from radar-4, one change at a time (leave-one-out median error): dropping growth ' + v.ablation_drop_growth_male.toFixed(2) + ', dropping maturity ' + v.ablation_drop_maturity_male.toFixed(2) + ', adding the chain-count term back ' + v.ablation_add_chain_male.toFixed(2) + ' — every change makes it worse, so all three are kept as fitted. The rank correlation is the Spearman correlation of predicted to real market cap across the 119 leave-one-out predictions: the flat multiple ranks slightly better (' + v.loo_flat.spearman.toFixed(2) + ') than radar-4 (' + v.loo_radar4.spearman.toFixed(2) + '), because the category multiples are noisy estimates and shuffle the TVL order; but its values are far off in level (median error 1.67 vs 1.17), and the board ranks by value, so calibration is what the board is for. Rank ranges and implied-value ranges are the 10th–90th percentiles of ' + v.bootstrap_refits + ' bootstrap refits of the calibration.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; var pos = search.selectionStart; writeHash(); render(); var again = document.getElementById('q'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} } });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
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
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = (DATA.rows[0] && DATA.rows[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, rankCell(r.rank)),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'range', text: r.rank_lo === r.rank_hi ? String(r.rank_lo) : r.rank_lo + '–' + r.rank_hi }),
        el('td', null, verdictBadge(r.farm_verdict)),
        el('td', null, el('span', { class: 'status', text: 'no token recorded' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Rank range is the 10th–90th percentile over 200 refits of the calibration. Farm verdict nets the plan\u2019s gas against the low end of the implied-value range: FARM when the rank range sits inside the top 40, THIN when it can still reach it, SKIP otherwise. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            sortHeader('ranklo', 'Rank range'),
            sortHeader('farm', 'Farm'),
            el('th', { scope: 'col', text: 'Token' })
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
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are what calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Built from the DefiLlama protocol snapshot of ' + DATA.as_of + '. Implied value is this entry\u2019s model, not a price, and not a prediction that a token will be issued: it says what a token would be worth if the protocol\u2019s record stayed as it is. A protocol that records no token may still have one its DefiLlama record does not carry.' }),
      el('p', { text: 'Built with an uncensored model on superbot.gg, the free client that keeps the agent sessions this entry hands in. Nothing on this page reaches the network: every figure it shows is in the snapshot.' })
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
    var economics = FARM.farmEconomics(base, row.implied_lo_usd, row.rank_lo, row.rank_hi);
    var steps = FARM.farmSteps(base, economics);
    var recomputed = impliedOf(row);
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
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' -> ' + fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token recorded' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' -> ' + fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { class: 'num', text: fmtMult(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Size (TVL vs median live ' + fmtUsd(DATA.model.size_ref_tvl_usd) + ')' }), el('b', { class: 'num', text: fmtMult(row.size_multiplier) })),
        el('div', null, el('span', { text: 'Rank range (200 refits, 10–90%)' }), el('b', { class: 'num', text: row.rank_lo === row.rank_hi ? String(row.rank_lo) : row.rank_lo + '–' + row.rank_hi })),
        el('div', null, el('span', { text: 'Implied-value range (200 refits, 10–90%)' }), el('b', { class: 'num', text: fmtUsd(row.implied_lo_usd) + ' – ' + fmtUsd(row.implied_hi_usd) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed.implied) + (recomputed.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Verdict' }), verdictBadge(economics.verdict)),
        el('div', null, el('span', { text: 'Gas for the whole plan' }), el('b', { class: 'num', text: '$' + economics.gas_usd })),
        el('div', null, el('span', { text: 'Capital locked' }), el('b', { class: 'num', text: '$' + economics.capital_usd + ' for ' + economics.hold_days + ' days' })),
        el('div', null, el('span', { text: 'Break-even (gas vs low-end implied value)' }), el('b', { class: 'num', text: economics.break_even_pct.toFixed(6) + '%' })),
        el('div', null, el('span', { text: 'Low-end implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_lo_usd) }))
      ),
      el('p', { class: 'sub', text: 'The rule, stated on the board: FARM when the rank range sits inside the top 40 and breaking even needs under 0.001% of the low-end value; THIN when the rank range can still reach the top 40 and breaking even needs under 0.01%; SKIP otherwise. Gas is never the binding constraint here — the median break-even across the board is a few ten-thousandths of a percent — the rank range is what decides.' })
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

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(validationStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
