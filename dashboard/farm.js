// The farm plan, shared by main.ts and the dashboard page: one derivation writes the plan
// board.json carries and the plan the detail view shows, so they cannot disagree. Seven
// steps, each an action with its cost and time, from the protocol's own record (category,
// chains, TVL, age). No protocol name is ever special-cased.
// UMD: Node imports it as a module, the dashboard loads it as a plain script.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarFarm = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** The first chain a protocol names, or a neutral phrase. */
  function chainOf(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  /** How much capital one farm position needs, from the protocol's own TVL. */
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  /** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  /** The category's main action, in the words a farmer can follow. */
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and hold it.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main strategy on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into the ' + name + ' basis vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one of its native apps.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + ' and make one payment with it.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s privacy pool on " + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and hold it.';
  }

  /** A second qualifying action, different from the first, so the wallet shows two kinds of activity. */
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $25 against the supply and repay it the same week, to show both sides of the market.';
    if (c.indexOf('dex') >= 0) return 'Swap $25 through the pool, to show a trade as well as the position.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('basis') >= 0) return 'Move $25 into a second strategy in the same vault, to show more than one position.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back the other way, to show two-way flow instead of one deposit.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the receipt once, so the position compounds and shows a second stake.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge and open a fresh one the next week, so the activity repeats.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first market and place a second small position, to show repeated use.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Hold through one distribution cycle and claim the yield, to show a claim as well as the deposit.';
    if (c.indexOf('insurance') >= 0) return 'File one test claim on a small cover, to show the policy being used.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Make a second payment in a different week, to show repeat spending.';
    if (c.indexOf('privacy') >= 0) return 'Withdraw a small amount back out, to show a full round trip.';
    return 'Do one more on-chain action in the app, such as a swap or a vote, to show more than one kind of activity.';
  }

  /** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  /** A dollar figure as $42.2M / $3.1K / $850, for the verdict step. */
  function fmtUsd(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  /**
   * A protocol's farm plan: seven action steps plus one verdict step. p carries name,
   * category, chains, tvl_usd and age_days. economics, when given, carries { gas_usd,
   * capital_usd, hold_days, break_even_pct, verdict, net_usd, deposit_usd, drop_share }
   * from farmEconomics, so the plan is sized to the deposit the reader picked.
   */
  function farmSteps(p, economics) {
    var chain = chainOf(p);
    var capital = economics && economics.capital_usd ? economics.capital_usd : capitalFor(p);
    var hold = economics && economics.hold_days ? economics.hold_days : holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet holding only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: "Before you deposit, read the protocol's audit and docs and approve only the exact amount, not an unlimited spend.", cost: 'nothing to read', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $25 moved and about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week: a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity counts in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page, claim only from the link it publishes, and log the wallet, the dates and every transaction.", cost: 'no fee to check, and never pay to claim', time: '15 minutes' }
    ];
    if (economics) {
      var e = economics;
      steps.push({
        text: 'Verdict: ' + e.verdict + '. The plan costs about $' + e.gas_usd + ' of gas and locks $' + e.capital_usd + ' for ' + e.hold_days + ' days; break-even needs an airdrop of $' + e.gas_usd + ', which is ' + e.break_even_pct + '% of the low-end implied value of $' + fmtUsd(e.implied_lo_usd) + ' (10th percentile of 200 refits). At a $' + e.deposit_usd + ' deposit and a ' + Math.round(e.drop_share * 1000) / 10 + '% drop share, the expected net is $' + e.net_usd + '.',
        cost: 'about $' + e.gas_usd + ' of gas in all',
        time: e.hold_days + ' days',
      });
    }
    return steps.map(stepText);
  }

  /** What a farm plan costs: $3 for the first transaction, $4 or $8 to set the position
   * up, $2 for the second action, $2 of gas for each week held. Capital is the deposit
   * the plan is sized to (default $1,000); locked, not spent, so not part of the cost. */
  function farmCost(p, deposit) {
    var capital = typeof deposit === 'number' && isFinite(deposit) && deposit > 0 ? deposit : capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = 3 + (capital >= 150 ? 8 : 4) + 2 + 2 * Math.ceil(hold / 7);
    return { gas_usd: gas, capital_usd: capital, hold_days: hold };
  }

  /** Expected net dollars of farming one protocol at one deposit and one drop share:
   * low-end implied value x share, split across the TVL in proportion to the deposit,
   * minus the plan's gas. The share (default 7%) is an assumption the page states, not
   * a measurement; the split assumes every TVL dollar farms on the same terms. */
  function netFarmUsd(impliedLoUsd, tvlUsd, gasUsd, deposit, share) {
    var dep = typeof deposit === 'number' && isFinite(deposit) && deposit > 0 ? deposit : 1000;
    var sh = typeof share === 'number' && isFinite(share) && share > 0 ? share : 0.07;
    var tvl = typeof tvlUsd === 'number' && tvlUsd > 0 ? tvlUsd : 1;
    var drop = impliedLoUsd * sh * dep / tvl;
    return Math.round((drop - gasUsd) * 100) / 100;
  }

  /** A farm verdict, by a rule the page states: FARM when the rank holds in the top 40
   * (the watchlist's size) even at the pessimistic end of the refits and breaking even
   * needs under 0.001% of the low-end implied value; THIN when the rank could be top 40
   * and breaking even needs under 0.01%; SKIP otherwise. */
  function farmVerdict(economics, rankLo, rankHi) {
    var be = economics.break_even_pct;
    if (rankHi <= 40 && be < 0.001) return 'FARM';
    if (rankLo <= 40 && be < 0.01) return 'THIN';
    return 'SKIP';
  }

  /** The full economics of farming one protocol: its cost, its break-even, its net dollars and its verdict. deposit defaults to $1,000, drop share to 7%. */
  function farmEconomics(p, impliedLoUsd, rankLo, rankHi, deposit, share) {
    var cost = farmCost(p, (typeof deposit === 'number' && isFinite(deposit) && deposit > 0) ? deposit : 1000);
    var lo = typeof impliedLoUsd === 'number' && impliedLoUsd > 0 ? impliedLoUsd : 1;
    var be = Math.round((cost.gas_usd / lo) * 100 * 1e6) / 1e6;
    var dep = cost.capital_usd;
    var sh = typeof share === 'number' && isFinite(share) && share > 0 ? share : 0.07;
    var economics = {
      gas_usd: cost.gas_usd,
      capital_usd: cost.capital_usd,
      hold_days: cost.hold_days,
      implied_lo_usd: Math.round(lo),
      break_even_pct: be,
      net_usd: netFarmUsd(lo, p.tvl_usd, cost.gas_usd, dep, sh),
      deposit_usd: dep,
      drop_share: sh,
      verdict: 'SKIP',
    };
    economics.verdict = farmVerdict(economics, rankLo, rankHi);
    return economics;
  }

  return {
    chainOf: chainOf,
    capitalFor: capitalFor,
    holdDaysFor: holdDaysFor,
    actionFor: actionFor,
    secondActionFor: secondActionFor,
    stepText: stepText,
    farmSteps: farmSteps,
    farmCost: farmCost,
    farmVerdict: farmVerdict,
    farmEconomics: farmEconomics,
    netFarmUsd: netFarmUsd,
  };
});
