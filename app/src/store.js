import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { DEF_CATS, adv, fmtDate, monthKey, monthOf, nextMs } from './util';

const KEY = 'pocket-rn-v3';
const Ctx = createContext(null);

export const blank = () => ({
  entries: [], holdings: [], accounts: [{ id: 'cash', name: 'Cash', init: 0 }],
  budgets: {}, recurring: [], goals: [], debts: [], rules: [],
  cats: { spent: [...DEF_CATS.spent], got: [...DEF_CATS.got] },
  snapshots: {}, cur: 'Rs', pin: '',
  last: { spent: '', got: '' }, sweep: true, buzzOn: true,
});

let buzzEnabled = true;
export const setBuzzEnabled = (v) => { buzzEnabled = v; };
export const buzz = (style) => {
  if (!buzzEnabled) return;
  Haptics.impactAsync(style || Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
export const buzzSuccess = () => {
  if (!buzzEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

// ------------------------------------------------------------- seed data --
// SHEETS.md §6 — deterministic (PRNG seed 42), 90 days ending today.
// Seeded on first launch only; "Erase everything" returns to a truly empty state.
export function seed() {
  let s = 42;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const day = 864e5;
  const now = Date.now();
  const weights = [['Food', 0.32], ['Travel', 0.20], ['Groceries', 0.15], ['Shopping', 0.10], ['Fun', 0.10], ['Bills', 0.07], ['Health', 0.06]];
  const pools = {
    Food: [4000, 4000, 12000, 18000, 25000], Travel: [6000, 6000, 24000, 35000],
    Groceries: [38000, 64000, 82000], Shopping: [99900, 249900], Fun: [29900, 49900],
    Bills: [120000], Health: [35000],
  };
  const notes = {
    Food: ['chai', 'swiggy', 'lunch'], Travel: ['uber', 'metro'], Groceries: ['bigbasket'],
    Shopping: [], Fun: [], Bills: ['wifi'], Health: ['pharmacy'],
  };
  const dstr = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    const base = now - i * day;
    const dt = new Date(base);
    const dom = dt.getDate();
    const at = (h) => new Date(dt.getFullYear(), dt.getMonth(), dom, h, Math.floor(rnd() * 59)).getTime();
    if (dom === 25) entries.push({ t: at(10), type: 'got', cat: 'Salary', amt: 8500000, acc: 'bank', note: 'salary' });
    if (dom === 1) entries.push({ t: at(9), type: 'spent', cat: 'Bills', amt: 1800000, acc: 'bank', note: 'rent' });
    if (dom === 14) entries.push({ t: at(21), type: 'spent', cat: 'Fun', amt: 49900, acc: 'bank', note: 'netflix' });
    if (dom === 10 && i > 5) entries.push({ t: at(12), type: 'transfer', from: 'bank', to: 'cash', amt: 500000 });
    if (i === 60) entries.push({ t: at(11), type: 'invest', cat: 'Index fund', amt: 2000000, acc: 'bank' });
    if (i === 30) entries.push({ t: at(11), type: 'invest', cat: 'Tesla', amt: 1000000, acc: 'bank' });
    const n = 1 + Math.floor(rnd() * 2);
    for (let j = 0; j < n; j++) {
      let r = rnd(), cat = 'Food';
      for (const [c, w] of weights) { if (r < w) { cat = c; break; } r -= w; }
      const pool = pools[cat], np = notes[cat];
      entries.push({
        t: at(8 + Math.floor(rnd() * 13)), type: 'spent', cat,
        amt: pool[Math.floor(rnd() * pool.length)],
        acc: rnd() < 0.4 ? 'cash' : 'bank',
        note: np[Math.floor(rnd() * np.length)] || undefined,
      });
    }
  }
  entries.push({ t: now - 36e5 * 3, type: 'got', cat: 'Freelance', amt: 1500000, acc: 'bank', note: 'logo work' });
  entries.sort((a, b) => a.t - b.t);
  return {
    ...blank(),
    cur: 'Rs',
    last: { spent: 'Food', got: 'Salary' },
    accounts: [{ id: 'cash', name: 'CASH', init: 1000000 }, { id: 'bank', name: 'BANK', init: 3000000 }],
    entries,
    budgets: { Food: 600000, Travel: 250000, Groceries: 500000, Shopping: 400000, Fun: 150000 },
    goals: [
      { id: 'g1', name: 'Emergency fund', target: 10000000, saved: 5000000, created: now - 90 * day },
      { id: 'g2', name: 'Goa trip', target: 2500000, saved: 1200000, created: now - 40 * day },
    ],
    debts: [{ id: 'd1', name: 'Credit card', total: 8000000, remaining: 4520000, rate: 36, min: 400000 }],
    holdings: [
      { id: 'h1', name: 'Index fund', invested: 2000000, value: 2265000 },
      { id: 'h2', name: 'Tesla', invested: 1000000, value: 1080000 },
    ],
    recurring: [
      { id: 'r1', note: 'Rent', type: 'spent', cat: 'Bills', amt: 1800000, freq: 'monthly', next: dstr(new Date(now + 3 * day)), auto: true, acc: 'bank' },
      { id: 'r2', note: 'Salary', type: 'got', cat: 'Salary', amt: 8500000, freq: 'monthly', next: dstr(new Date(now + 27 * day)), auto: true, acc: 'bank' },
      { id: 'r3', note: 'Gym', type: 'spent', cat: 'Health', amt: 150000, freq: 'monthly', next: dstr(new Date(now)), auto: false, acc: 'bank' },
      { id: 'r4', note: 'Netflix', type: 'spent', cat: 'Fun', amt: 49900, freq: 'monthly', next: dstr(new Date(now + 16 * day)), auto: true, acc: 'bank' },
    ],
    rules: [{ id: 'rl1', match: 'swiggy', cat: 'Food', type: 'spent' }],
    sweep: true, buzzOn: true,
  };
}

function migrate(d) {
  const b = blank();
  for (const k of Object.keys(b)) if (d[k] === undefined) d[k] = b[k];
  if (!Array.isArray(d.accounts) || !d.accounts.length) d.accounts = b.accounts;
  const first = d.accounts[0].id;
  for (const e of d.entries) {
    if (!e.acc) e.acc = first;
    if (e.type === 'transfer' && !e.from) e.from = first;
    if (e.type === 'transfer' && !e.to) e.to = first;
  }
  if (!d.cats || !Array.isArray(d.cats.spent) || !Array.isArray(d.cats.got)) d.cats = b.cats;
  d.cats.spent = [...new Set([...DEF_CATS.spent, ...d.cats.spent])];
  d.cats.got = [...new Set([...DEF_CATS.got, ...d.cats.got])];
  for (const r of d.recurring) {
    if (!r.freq) r.freq = 'monthly';
    if (!r.next) r.next = fmtDate(new Date());
    if (!r.acc) r.acc = first;
  }
  for (const g of d.goals) if (!g.created) g.created = Date.now();
  if (!d.last || typeof d.last !== 'object') d.last = { spent: '', got: '' };
  if (typeof d.sweep !== 'boolean') d.sweep = true;
  if (typeof d.buzzOn !== 'boolean') d.buzzOn = true;
  return d;
}

function processDue(d) {
  const todayS = fmtDate(new Date());
  let n = 0;
  for (const r of d.recurring) {
    if (!r.auto) continue;
    let g = 0;
    while (r.next <= todayS && g++ < 40) {
      d.entries.push({ t: nextMs(r.next), type: r.type, cat: r.cat, amt: r.amt, note: r.note || undefined, acc: r.acc });
      r.next = adv(r.next, r.freq);
      n++;
    }
  }
  return n;
}

export function accBalance(d, a) {
  let b = a.init || 0;
  for (const e of d.entries) {
    if (e.type === 'got') { if (e.acc === a.id) b += e.amt; }
    else if (e.type === 'spent' || e.type === 'invest') { if (e.acc === a.id) b -= e.amt; }
    else if (e.type === 'transfer') { if (e.from === a.id) b -= e.amt; else if (e.to === a.id) b += e.amt; }
  }
  return b;
}

export function totals(d) {
  const now = new Date();
  const ym = monthOf(Date.now());
  let ts = 0, tg = 0, cash = 0, mSpent = 0, mGot = 0, inv = 0;
  for (const a of d.accounts) cash += accBalance(d, a);
  for (const e of d.entries) {
    const ed = new Date(e.t);
    const sameDay = ed.toDateString() === now.toDateString();
    const sameMonth = monthOf(e.t) === ym;
    if (e.type === 'got') { if (sameDay) tg += e.amt; if (sameMonth) mGot += e.amt; }
    else if (e.type === 'spent') { if (sameDay) ts += e.amt; if (sameMonth) mSpent += e.amt; }
    else if (e.type === 'invest') inv += e.amt;
  }
  const invV = d.holdings.reduce((a, h) => a + h.value, 0);
  const debtR = d.debts.reduce((a, x) => a + x.remaining, 0);
  const net = cash + invV - debtR;
  return { ts, tg, cash, net, invV, inv, debtR, mSpent, mGot };
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(blank);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState('cash');
  const [toast, setToast] = useState(null); // { msg, undoable }
  const undoSnap = useRef(null);
  const toastT = useRef(null);

  const persist = (d) => AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});

  const show = useCallback((msg, undoable = false) => {
    clearTimeout(toastT.current);
    setToast({ msg, undoable });
    toastT.current = setTimeout(() => setToast(null), undoable ? 3000 : 1600);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        let d = null;
        if (raw) { try { d = JSON.parse(raw); } catch (e) {} }
        if (!d) d = seed(); // first launch only — real data replaces it
        migrate(d);
        const n = processDue(d);
        d.snapshots[monthKey(new Date())] = totals(d).net;
        persist(d);
        setData(d);
        setSel(d.accounts[0].id);
        if (n) show('Auto-logged ' + n + ' recurring');
      })
      .finally(() => setReady(true));
  }, []);

  // update(fn, msg, undoable): fn mutates a working copy.
  const update = useCallback((fn, msg, undoable = false) => {
    setData((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      fn(d);
      migrate(d);
      if (undoable) undoSnap.current = prev;
      persist(d);
      return d;
    });
    if (msg) show(msg, undoable);
  }, [show]);

  const undo = useCallback(() => {
    if (!undoSnap.current) return;
    const prev = undoSnap.current;
    undoSnap.current = null;
    setData(prev);
    persist(prev);
    setToast(null);
    buzz();
  }, []);

  useEffect(() => { setBuzzEnabled(data.buzzOn !== false); }, [data.buzzOn]);

  const t = useMemo(() => totals(data), [data]);
  const money = useCallback((c) => data.cur + ((c < 0 ? '−' : '') +
    (Math.abs(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })), [data.cur]);
  const accName = useCallback((id) => (data.accounts.find((x) => x.id === id) || { name: '?' }).name, [data.accounts]);
  const catsFor = useCallback((type) => data.cats[type] || DEF_CATS[type] || [], [data.cats]);

  const value = {
    data, ready, sel, setSel, update, undo, toast, show,
    totals: t, money, accName, catsFor,
    accBalance: (a) => accBalance(data, a),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
