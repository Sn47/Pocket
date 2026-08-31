// ---------------------------------------------------------------------------
// Pocket v2.1 rule engine — ported 1:1 from the prototype.
// All deterministic, all local. No LLM, nothing leaves the phone.
// ---------------------------------------------------------------------------
import { C, GRAYS } from './theme';
import { emojiFor, fmt0, monthOf, nextMs } from './util';

const day = 864e5;

export function analyze(d, now = new Date()) {
  const ym = monthOf(now.getTime());
  const prevYm = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime());
  const domNow = now.getDate();
  const dimNow = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  let ts = 0, tg = 0, tc = 0, mSpent = 0, mGot = 0, prevSpent = 0, prevGot = 0;
  const byCat = {}, prevByCat = {};
  for (const e of d.entries) {
    const sameDay = new Date(e.t).toDateString() === now.toDateString();
    if (sameDay && e.type !== 'transfer') tc++;
    const mk = monthOf(e.t);
    if (e.type === 'spent') {
      if (sameDay) ts += e.amt;
      if (mk === ym) { byCat[e.cat] = (byCat[e.cat] || 0) + e.amt; mSpent += e.amt; }
      if (mk === prevYm) { prevByCat[e.cat] = (prevByCat[e.cat] || 0) + e.amt; prevSpent += e.amt; }
    } else if (e.type === 'got') {
      if (sameDay) tg += e.amt;
      if (mk === ym) mGot += e.amt;
      if (mk === prevYm) prevGot += e.amt;
    }
  }

  const invV = d.holdings.reduce((a, h) => a + h.value, 0);
  const invIn = d.holdings.reduce((a, h) => a + h.invested, 0);
  const debtR = d.debts.reduce((a, x) => a + x.remaining, 0);
  let cashNow = 0;
  for (const a of d.accounts) {
    let b = a.init || 0;
    for (const e of d.entries) {
      if (e.type === 'got') { if (e.acc === a.id) b += e.amt; }
      else if (e.type === 'spent' || e.type === 'invest') { if (e.acc === a.id) b -= e.amt; }
      else if (e.type === 'transfer') { if (e.from === a.id) b -= e.amt; else if (e.to === a.id) b += e.amt; }
    }
    cashNow += b;
  }
  const net = cashNow + invV - debtR;

  // 12 months of spent/got
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = dt.getFullYear() * 100 + dt.getMonth();
    let sp = 0, gt = 0;
    for (const e of d.entries) {
      if (monthOf(e.t) !== key) continue;
      if (e.type === 'spent') sp += e.amt;
      else if (e.type === 'got') gt += e.amt;
    }
    months.push({ label: dt.toLocaleDateString(undefined, { month: 'short' }), spent: sp, got: gt, key });
  }

  // 90-day aggregates
  const cutoff90 = Date.now() - 90 * day;
  let sp90 = 0, gt90 = 0;
  for (const e of d.entries) {
    if (e.t < cutoff90) continue;
    if (e.type === 'spent') sp90 += e.amt;
    else if (e.type === 'got') gt90 += e.amt;
  }
  const avgSpend = (sp90 / 3) || 1;
  const avgIncome = gt90 / 3;
  const runway = cashNow / avgSpend;
  const saveRate = gt90 > 0 ? (gt90 - sp90) / gt90 : 0;
  const assets = cashNow + invV;
  const debtFactor = debtR <= 0 ? 1 : assets > 0 ? Math.max(0, 1 - debtR / assets) : 0;
  const budCats = Object.keys(d.budgets).filter((c) => d.budgets[c] > 0);
  const discipline = budCats.length ? budCats.filter((c) => (byCat[c] || 0) <= d.budgets[c]).length / budCats.length : 1;
  const f1 = Math.max(0, Math.min(1, saveRate / 0.3));
  const f2 = Math.min(1, runway / 6);
  const f3 = debtFactor;
  const f4 = discipline;
  const score = Math.round(f1 * 30 + f2 * 30 + f3 * 25 + f4 * 15);
  const worstDebt = [...d.debts].filter((x) => x.remaining > 0).sort((a, b) => b.rate - a.rate)[0];
  const upcoming30 = d.recurring.filter((r) => r.type === 'spent').reduce((a, r) => {
    const dy = Math.round((nextMs(r.next) - Date.now()) / day);
    return a + (dy >= 0 && dy <= 30 ? r.amt : 0);
  }, 0);
  const freeCash = Math.max(0, cashNow - 3 * avgSpend - upcoming30);

  const totLim = budCats.reduce((a, c) => a + d.budgets[c], 0);
  const totSp = Object.keys(d.budgets).reduce((a, c) => a + (d.budgets[c] ? byCat[c] || 0 : 0), 0);
  const catList = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);

  return {
    ym, prevYm, domNow, dimNow, ts, tg, tc, mSpent, mGot, byCat, prevByCat, prevSpent, prevGot,
    invV, invIn, debtR, cashNow, net, months, sp90, gt90, avgSpend, avgIncome, runway, saveRate,
    f1, f2, f3, f4, score, worstDebt, upcoming30, freeCash, budCats, totLim, totSp, catList,
  };
}

// ---------------------------------------------------------------- insights --
// chart = { items: [{ label, v, c, top }] } rendered by the Bars component.
export function buildInsights(d, A, cur, spentCats) {
  const dismissed = d.dismissedIns || {};
  const out = [];
  const add = (id, sev, impact, title, val, valC, detail, evidence, action, chart) => {
    const ts0 = dismissed[id];
    if (ts0 && Date.now() - ts0 < 30 * day) return;
    out.push({ id, sev, impact, title, val, valC, detail, evidence, action: action || null, chart: chart || null });
  };
  const { worstDebt, byCat, prevByCat, months, avgSpend, avgIncome, cashNow, runway, freeCash, upcoming30, mGot, mSpent, domNow, dimNow, saveRate, gt90 } = A;

  if (worstDebt) {
    const intMo = (worstDebt.remaining * worstDebt.rate) / 1200;
    const payoff = (pay) => { let rr = worstDebt.remaining, m2 = 0; while (rr > 0 && m2 < 600) { rr += (rr * worstDebt.rate) / 1200 - pay; m2++; } return m2; };
    const base = worstDebt.min > 0 ? worstDebt.min : 400000;
    const extra = 500000;
    const m0 = payoff(base), m1 = payoff(base + extra);
    if (intMo > 0) add('debt', 'red', intMo * 12, worstDebt.name + ' is bleeding interest', '−' + fmt0(intMo) + '/mo', C.neg,
      'At ' + worstDebt.rate + '%, ' + worstDebt.name + ' costs about ' + cur + fmt0(intMo) + ' every month before you buy anything. Clearing it is the highest guaranteed return you have.',
      ['interest ≈ −' + fmt0(intMo) + '/mo · −' + fmt0(intMo * 12) + '/yr',
        'at ' + fmt0(base) + '/mo → debt-free in ~' + m0 + ' mo',
        'at ' + fmt0(base + extra) + '/mo → ~' + m1 + ' mo (' + Math.max(0, m0 - m1) + ' mo sooner)'],
      { label: 'pay now', c: C.pos, type: 'debt', id: worstDebt.id },
      { items: [{ label: 'at ' + fmt0(base) + '/mo', v: m0, c: C.neg, top: m0 + ' mo' }, { label: '+' + fmt0(extra) + '/mo', v: m1, c: C.pos, top: m1 + ' mo' }] });
  }
  {
    const last3 = months.slice(-3);
    let worstB = null;
    for (const c of A.budCats) {
      const rows2 = last3.map((m) => { let s2 = 0; for (const e of d.entries) if (e.type === 'spent' && e.cat === c && monthOf(e.t) === m.key) s2 += e.amt; return { label: m.label, s: s2 }; });
      const overs = rows2.filter((r) => r.s > d.budgets[c]);
      if (overs.length >= 2) {
        const avgOver = overs.reduce((a, r) => a + r.s - d.budgets[c], 0) / overs.length;
        if (!worstB || avgOver > worstB.avgOver) worstB = { c, rows2, avgOver, n: overs.length };
      }
    }
    if (worstB) {
      const sug = Math.ceil(worstB.rows2.reduce((a, r) => a + r.s, 0) / 3 / 50000) * 50000;
      add('budget-' + worstB.c, 'red', worstB.avgOver * 12, emojiFor(worstB.c) + ' ' + worstB.c + ' budget is fiction', '+' + fmt0(worstB.avgOver) + '/mo', C.neg,
        worstB.c + ' broke its ' + cur + fmt0(d.budgets[worstB.c]) + " limit in " + worstB.n + " of the last 3 months. Either the limit is honest or it isn't a limit.",
        worstB.rows2.map((r) => r.label + '  ' + fmt0(r.s) + ' / ' + fmt0(d.budgets[worstB.c]) + (r.s > d.budgets[worstB.c] ? '  🔥' : '')),
        { label: 'set ' + fmt0(sug) + ' honestly', c: C.ink, type: 'budget', cat: worstB.c, initial: sug },
        { items: worstB.rows2.map((r) => ({ label: r.label, v: r.s, c: r.s > d.budgets[worstB.c] ? C.neg : C.pos, top: fmt0(r.s) })) });
    }
  }
  if (freeCash > avgSpend * 0.5) add('idle', 'mid', freeCash * 0.12, 'Idle cash above cushion', fmt0(freeCash), C.inv,
    cur + fmt0(freeCash) + ' sits beyond a 3-month cushion and the next 30 days of bills. It earns nothing while prices rise ~6%/yr.',
    ['cash ' + fmt0(cashNow), 'cushion (3 × avg spend)  −' + fmt0(3 * avgSpend), 'bills next 30d  −' + fmt0(upcoming30),
      'inflation drag ≈ −' + fmt0((freeCash * 0.06) / 12) + '/mo', 'invested at ~12% ≈ +' + fmt0((freeCash * 0.12) / 12) + '/mo'],
    { label: '↗ invest it', c: C.inv, type: 'invest', initial: freeCash },
    { items: [{ label: 'cushion', v: 3 * avgSpend, c: C.ink4, top: fmt0(3 * avgSpend) }, { label: 'bills 30d', v: upcoming30, c: C.ink3, top: fmt0(upcoming30) }, { label: 'free', v: freeCash, c: C.inv, top: fmt0(freeCash) }] });
  {
    const subs = d.recurring.filter((r) => r.type === 'spent' && (r.note || r.name || '').toLowerCase() !== 'rent');
    const tot3 = subs.reduce((a, r) => a + r.amt, 0);
    if (subs.length >= 2 && avgIncome > 0) {
      const nameOf = (r) => r.note || r.name || r.cat;
      const ev = subs.map((r) => nameOf(r) + '  −' + fmt0(r.amt) + '/mo' + (r.auto ? ' · auto' : ''));
      const gym = d.recurring.find((r) => (r.note || r.name || '').toLowerCase() === 'gym');
      if (gym && !d.entries.some((e) => e.type === 'spent' && e.cat === 'Health' && e.t > Date.now() - 45 * day)) ev.push('Gym: no 💊 activity in 45d — unused?');
      add('subs', 'mid', tot3 * 12 * 0.2, 'Recurring eats income first', '−' + fmt0(tot3) + '/mo', C.ink,
        subs.length + ' recurring charges take ' + Math.round((tot3 / avgIncome) * 100) + '% of income before the month even starts.',
        ev, { label: '→ review recurring', c: C.ink, type: 'plan' });
    }
  }
  {
    const sal = [...d.entries].filter((e) => e.type === 'got' && e.amt >= avgIncome * 0.5).sort((a, b) => b.t - a.t)[0];
    if (sal) {
      let burn = 0, mTot = 0;
      const mk2 = monthOf(sal.t);
      for (const e of d.entries) { if (e.type !== 'spent' || monthOf(e.t) !== mk2) continue; mTot += e.amt; if (e.t >= sal.t && e.t <= sal.t + 5 * day) burn += e.amt; }
      const pct2 = mTot > 0 ? Math.round((burn / mTot) * 100) : 0;
      if (pct2 >= 35) add('payday', 'mid', burn * 0.1, 'Payday burn pattern', pct2 + '% in 5d', C.ink,
        pct2 + "% of that month's spending happened within 5 days of salary landing. Money spent early is decided by mood, not plan.",
        ['salary ' + new Date(sal.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '  +' + fmt0(sal.amt),
          'first 5 days after  −' + fmt0(burn), 'rest of month  −' + fmt0(mTot - burn)], null,
        { items: [{ label: 'first 5 days', v: burn, c: C.neg, top: fmt0(burn) }, { label: 'rest of month', v: mTot - burn, c: C.ink4, top: fmt0(mTot - burn) }] });
    }
  }
  if (runway < 3) add('runway', 'red', Math.max(0, 3 * avgSpend - cashNow) * 0.5, 'Thin safety cushion', runway.toFixed(1) + ' mo', C.neg,
    'If income stopped today, cash covers ' + runway.toFixed(1) + ' months of your real spending. Three months is the floor before anything else.',
    ['cash ' + fmt0(cashNow), 'avg spend ' + fmt0(avgSpend) + '/mo', 'gap to 3 mo  ' + fmt0(Math.max(0, 3 * avgSpend - cashNow))], null,
    { items: [{ label: 'cash now', v: cashNow, c: C.neg, top: fmt0(cashNow) }, { label: '3-mo floor', v: 3 * avgSpend, c: C.ink4, top: fmt0(3 * avgSpend) }] });
  for (const g of d.goals) {
    if (g.saved < g.target && g.saved / g.target >= 0.9) {
      add('goal-' + g.id, 'good', 0, '◎ ' + g.name + ' is nearly there', Math.round((g.saved / g.target) * 100) + '%', C.pos,
        'Only ' + cur + fmt0(g.target - g.saved) + ' left. One deliberate top-up closes it — finished goals change behavior more than growing ones.',
        ['saved ' + fmt0(g.saved) + ' / ' + fmt0(g.target), 'remaining ' + fmt0(g.target - g.saved)],
        { label: '＋ finish it', c: C.pos, type: 'goal', id: g.id, initial: g.target - g.saved });
      break;
    }
  }
  for (const h of d.holdings) {
    if (h.value < h.invested) add('hold-' + h.id, 'mid', h.invested - h.value, '↗ ' + h.name + ' is underwater', (((h.value - h.invested) / h.invested) * 100).toFixed(1) + '%', C.neg,
      h.name + ' is worth less than you put in. Update its value, or decide whether it still earns its place.',
      ['invested ' + fmt0(h.invested), 'now ' + fmt0(h.value), 'loss ' + fmt0(h.invested - h.value)],
      { label: 'update value', c: C.inv, type: 'holding', id: h.id, initial: h.value });
  }
  {
    let big = null;
    for (const n of spentCats) {
      if (n === 'Other' || d.budgets[n]) continue;
      const s2 = byCat[n] || 0;
      if (avgIncome > 0 && s2 > avgIncome * 0.08 && (!big || s2 > big.s)) big = { n, s: s2 };
    }
    if (big) add('nobudget-' + big.n, 'mid', big.s * 12 * 0.1, emojiFor(big.n) + ' ' + big.n + ' has no limit', fmt0(big.s), C.ink,
      big.n + ' took ' + cur + fmt0(big.s) + ' this month with nothing watching it. Unbudgeted categories are where months quietly go wrong.',
      ['this month ' + fmt0(big.s), '≈ ' + Math.round((big.s / (avgIncome || 1)) * 100) + '% of monthly income'],
      { label: 'set a limit', c: C.ink, type: 'budget', cat: big.n, initial: Math.ceil(big.s / 50000) * 50000 });
  }
  {
    const rateNow = mGot > 0 ? (mGot - mSpent) / mGot : null;
    if (rateNow !== null && gt90 > 0 && rateNow < saveRate - 0.1) add('ratedrop', 'mid', (saveRate - rateNow) * mGot, 'Savings rate slipping', Math.round(rateNow * 100) + '% vs ' + Math.round(saveRate * 100) + '%', C.neg,
      "This month you're keeping " + Math.round(rateNow * 100) + '% of income against a 90-day average of ' + Math.round(saveRate * 100) + '%.',
      ['this month  +' + fmt0(mGot) + '  −' + fmt0(mSpent), '90-day average rate ' + Math.round(saveRate * 100) + '%'], null);
  }
  {
    let spike = null;
    for (const c in byCat) {
      const pace = domNow >= 3 ? (byCat[c] / domNow) * dimNow : byCat[c];
      const pv = prevByCat[c] || 0;
      if (pv > 0 && pace > pv * 1.3 && byCat[c] > avgIncome * 0.04) { const inc = pace - pv; if (!spike || inc > spike.inc) spike = { c, pace, pv, inc }; }
    }
    if (spike) add('spike-' + spike.c, 'mid', spike.inc * 12, emojiFor(spike.c) + ' ' + spike.c + ' is spiking', '+' + Math.round((spike.pace / spike.pv - 1) * 100) + '%', C.neg,
      spike.c + ' is pacing ' + Math.round((spike.pace / spike.pv - 1) * 100) + "% above last month. Spikes caught mid-month are cheap to fix; noticed in December they're history.",
      ['last month ' + fmt0(spike.pv), 'this month so far ' + fmt0(byCat[spike.c]), 'full-month pace ' + fmt0(spike.pace)],
      d.budgets[spike.c] ? null : { label: 'set a limit', c: C.ink, type: 'budget', cat: spike.c, initial: Math.ceil(spike.pv / 50000) * 50000 },
      { items: [{ label: 'last month', v: spike.pv, c: C.ink4, top: fmt0(spike.pv) }, { label: 'this month pace', v: spike.pace, c: C.neg, top: fmt0(spike.pace) }] });
  }
  {
    const rent = d.recurring.find((r) => r.type === 'spent' && (r.note || r.name || '').toLowerCase() === 'rent');
    if (rent && avgIncome > 0 && rent.amt / avgIncome > 0.3) add('rent', 'mid', (rent.amt - avgIncome * 0.3) * 12, 'Rent is heavy for this income', Math.round((rent.amt / avgIncome) * 100) + '%', C.ink,
      'Rent takes ' + Math.round((rent.amt / avgIncome) * 100) + '% of income — above the 30% rule of thumb. Fixed costs decide how hard everything else has to work.',
      ['rent −' + fmt0(rent.amt) + '/mo', 'income ≈ ' + fmt0(avgIncome) + '/mo', '30% ceiling would be ' + fmt0(avgIncome * 0.3)], null,
      { items: [{ label: 'rent', v: rent.amt, c: C.neg, top: fmt0(rent.amt) }, { label: '30% ceiling', v: avgIncome * 0.3, c: C.ink4, top: fmt0(avgIncome * 0.3) }] });
  }
  if (mGot === 0 && domNow >= 15 && avgIncome > 0) add('noincome', 'red', avgIncome, 'No income logged this month', '+0', C.neg,
    'Half the month gone with zero income recorded. If money came in, log it — every number here depends on it.',
    ['this month +0', '90-day average +' + fmt0(avgIncome) + '/mo'], null);
  {
    let we = 0, wd = 0;
    const cutoff90b = Date.now() - 90 * day;
    for (const e of d.entries) { if (e.type !== 'spent' || e.t < cutoff90b) continue; const dy = new Date(e.t).getDay(); if (dy === 0 || dy === 6) we += e.amt; else wd += e.amt; }
    const tot4 = we + wd;
    if (tot4 > 0 && we / tot4 > 0.4) add('weekend', 'mid', we * 0.1, 'Weekends drive your spending', Math.round((we / tot4) * 100) + '%', C.ink,
      'Two days of the week take ' + Math.round((we / tot4) * 100) + '% of 90-day spending. Weekend money is mood money.',
      ['weekends −' + fmt0(we) + ' · ≈' + fmt0(we / 26) + '/day', 'weekdays −' + fmt0(wd) + ' · ≈' + fmt0(wd / 64) + '/day'], null,
      { items: [{ label: 'weekend/day', v: we / 26, c: C.neg, top: fmt0(we / 26) }, { label: 'weekday/day', v: wd / 64, c: C.ink4, top: fmt0(wd / 64) }] });
  }
  {
    const rateNow2 = mGot > 0 ? (mGot - mSpent) / mGot : null;
    if (rateNow2 !== null && domNow >= 20) {
      const prevRates = months.slice(-7, -1).filter((m) => m.got > 0).map((m) => (m.got - m.spent) / m.got);
      if (prevRates.length >= 2 && rateNow2 > Math.max(...prevRates)) add('bestmonth', 'good', 0, 'Best savings month in half a year', Math.round(rateNow2 * 100) + '%', C.pos,
        "You're keeping " + Math.round(rateNow2 * 100) + '% of income this month — the highest in six months. Whatever changed, keep it.',
        ['this month ' + Math.round(rateNow2 * 100) + '%', 'previous best ' + Math.round(Math.max(...prevRates) * 100) + '%'], null);
    }
  }
  const sevRank = { red: 0, mid: 1, good: 2 };
  out.sort((a, b) => sevRank[a.sev] - sevRank[b.sev] || b.impact - a.impact);
  return out;
}

// -------------------------------------------------------- small helpers ----
// recurring suggestion: same note+amount 1–2× in both this and last month
export function suggestRec(d, A) {
  const combos = {};
  for (const e of d.entries) {
    if (!e.note || (e.type !== 'spent' && e.type !== 'got')) continue;
    const k = e.note.toLowerCase() + '|' + e.amt + '|' + e.type;
    if (!combos[k]) combos[k] = { e, m: {} };
    const mk = monthOf(e.t);
    combos[k].m[mk] = (combos[k].m[mk] || 0) + 1;
  }
  for (const k in combos) {
    const c0 = combos[k];
    const nm = c0.e.note.toLowerCase();
    if (!(c0.m[A.ym] >= 1 && c0.m[A.ym] <= 2 && c0.m[A.prevYm] >= 1 && c0.m[A.prevYm] <= 2)) continue;
    if ((d.dismissedRec || []).includes(nm)) continue;
    if (d.recurring.some((r) => (r.note || r.name || '').toLowerCase() === nm)) continue;
    return c0.e;
  }
  return null;
}

// bill radar: soonest recurring 1–7 days out
export function billRadar(d) {
  return d.recurring
    .map((r) => ({ r, days: Math.max(0, Math.round((nextMs(r.next) - Date.now()) / day)) }))
    .filter((x) => x.days > 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)[0] || null;
}

// 7 tappable day bars (weekends dimmer, today highlighted)
export function weekBars(d, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dd0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    let sp = 0;
    for (const e of d.entries) if (e.type === 'spent' && new Date(e.t).toDateString() === dd0.toDateString()) sp += e.amt;
    days.push(sp);
  }
  const mx = Math.max(...days, 1);
  return days.map((v, i) => {
    const dt2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const we = dt2.getDay() === 0 || dt2.getDay() === 6;
    return {
      h: Math.max(2, Math.round((v / mx) * 18)),
      c: i === 6 ? C.ink2 : v === 0 ? (we ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)') : we ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
      off: 6 - i,
    };
  });
}

// micro line: spend pace + 🌱 no-spend streak
export function microLine(d, A, now = new Date()) {
  let s0 = A.domNow >= 3 && A.mSpent > 0 ? 'at this pace  −' + fmt0((A.mSpent / A.domNow) * A.dimNow) + ' this month' : '';
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const key = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toDateString();
    if (d.entries.some((e) => e.type === 'spent' && new Date(e.t).toDateString() === key)) break;
    streak++;
  }
  if (streak >= 2) s0 += (s0 ? '  ·  ' : '') + '🌱 ' + streak + ' no-spend days';
  return s0;
}

// last month's report-card pill text
export function reportText(d, A, now = new Date()) {
  const r2 = A.prevGot > 0 ? Math.round(((A.prevGot - A.prevSpent) / A.prevGot) * 100) : null;
  let hot = '', hr = 0;
  for (const c in d.budgets) {
    const s2 = A.prevByCat[c] || 0;
    if (d.budgets[c] > 0 && s2 / d.budgets[c] > hr) { hr = s2 / d.budgets[c]; hot = c; }
  }
  const pl = new Date(now.getFullYear(), now.getMonth() - 1, 15).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return pl + (r2 === null ? '' : ' · saved ' + r2 + '%') + (hr > 1 ? ' · 🔥 ' + emojiFor(hot) : '');
}

// quick amounts: frequency × recency decay × time-of-day affinity
export function smartQuick(d, now = new Date()) {
  const freq = {};
  const hourNow = now.getHours();
  for (const e of d.entries) {
    if (e.type !== 'spent') continue;
    const age = (Date.now() - e.t) / day;
    const hd = Math.abs(new Date(e.t).getHours() - hourNow);
    const w = Math.exp(-age / 30) * (Math.min(hd, 24 - hd) <= 3 ? 1.6 : 1);
    freq[e.amt] = (freq[e.amt] || 0) + w;
  }
  return Object.keys(freq).map(Number).sort((a, b) => freq[b] - freq[a] || a - b).slice(0, 4).sort((a, b) => a - b);
}

// cumulative daily spend curves: this month (to date) vs last month (full)
export function paceData(d, now = new Date()) {
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cum = (y, m, upto) => {
    const dimM = new Date(y, m + 1, 0).getDate();
    const daily = new Array(dimM + 1).fill(0);
    for (const e of d.entries) { const dt = new Date(e.t); if (e.type === 'spent' && dt.getFullYear() === y && dt.getMonth() === m) daily[dt.getDate()] += e.amt; }
    const arr = [0];
    let acc = 0;
    for (let i = 1; i <= Math.min(upto, dimM); i++) { acc += daily[i]; arr.push(acc); }
    return arr;
  };
  const curA = cum(now.getFullYear(), now.getMonth(), now.getDate());
  const pm = now.getMonth() === 0 ? { y: now.getFullYear() - 1, m: 11 } : { y: now.getFullYear(), m: now.getMonth() - 1 };
  return { cur: curA, prev: cum(pm.y, pm.m, 31), dim };
}

// daily-rotating mindful line
export function mindfulLine(d, A, now = new Date()) {
  let logs = 0;
  for (const e of d.entries) if (monthOf(e.t) === A.ym && e.type !== 'transfer') logs++;
  const topC = A.catList[0];
  const lines = [
    'You looked at your money ' + logs + ' times this month. Noticing is most of the work.',
    "Every entry here was a decision. The next one hasn't been made yet.",
    topC ? 'If ' + topC + ' spending matched how much you think about it, would it be ' + Math.round(((A.byCat[topC] || 0) / (A.mSpent || 1)) * 100) + '%?' : 'A quiet ledger is not the same as a quiet mind.',
    'The balance is a number. The pattern underneath it is the truth.',
    'Small amounts logged honestly beat big plans made loudly.',
  ];
  return lines[now.getDate() % lines.length];
}

export function scoreLever(A) {
  const fs = [
    [A.f1, 'raising your savings rate moves the score most'],
    [A.f2, 'build cash runway toward 6 months'],
    [A.f3, A.worstDebt ? 'clearing ' + A.worstDebt.name + ' at ' + A.worstDebt.rate + '% is your biggest win' : ''],
    [A.f4, 'stay under budget in more categories'],
  ].filter((x) => x[1]);
  fs.sort((a, b) => a[0] - b[0]);
  return 'Biggest lever: ' + fs[0][1];
}

export const GRAY_AT = (i) => GRAYS[Math.min(i, 6)];
