import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { MOODS, adv, allCats, fmtDate, gotSet, monthKey, monthOf, nextMs, setCustomEmoji } from './util';

const KEY = 'pocket-rn-v4'; // v3 design, v4 storage shape
const Ctx = createContext(null);

export const blank = () => ({
  cur: 'Rs',
  profile: null, // { name, sources[], tops[] } — set by onboarding
  entries: [], // { id, t, type: spent|got|invest|save|unsave, cat, amt, note, acc }
  savings: 0,
  cats: [], // custom spend categories as [emoji, name] pairs
  accounts: [{ id: 'cash', name: 'Cash', init: 0 }],
  budgets: {}, recurring: [], goals: [], debts: [], holdings: [], rules: [],
  snapshots: {}, pin: '',
  last: { spent: 'Food', got: 'Salary' }, sweep: true, buzzOn: true,
  pins: [], dismissedRec: [], dismissedIns: {}, lastReport: '', surplusDone: '',
  moodOn: true, ambientOn: true, offerOn: true, suggestOn: true,
  moods: { ok: [...MOODS.ok], tight: [...MOODS.tight], low: [...MOODS.low] },
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
// v3 fixtures: 90 days, seeded RNG(42) — see SHEETS.md. First launch only.
export function seed() {
  let s = 42;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const day = 864e5;
  const now = Date.now();
  const pools = {
    Food: [4000, 4000, 12000, 18000, 25000], Travel: [6000, 6000, 24000, 35000],
    Groceries: [38000, 64000, 82000], Shopping: [99900, 249900], Fun: [29900, 49900],
    Bills: [120000], Health: [35000],
  };
  const notes = {
    Food: ['chai', 'swiggy', 'lunch', ''], Travel: ['uber', 'metro', ''], Groceries: ['bigbasket', ''],
    Shopping: ['', ''], Fun: ['', ''], Bills: ['wifi', ''], Health: ['pharmacy', ''],
  };
  const weights = [['Food', 0.32], ['Travel', 0.20], ['Groceries', 0.15], ['Shopping', 0.10], ['Fun', 0.10], ['Bills', 0.07], ['Health', 0.06]];
  const dstr = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const entries = [];
  for (let i = 89; i >= 0; i--) {
    const base = now - i * day;
    const dt = new Date(base);
    const dom = dt.getDate();
    const at = (h) => new Date(dt.getFullYear(), dt.getMonth(), dom, h, Math.floor(rnd() * 59)).getTime();
    if (dom === 25) entries.push({ t: at(10), type: 'got', cat: 'Salary', amt: 8500000, acc: 'cash', note: 'salary' });
    if (dom === 1) entries.push({ t: at(9), type: 'spent', cat: 'Bills', amt: 1800000, acc: 'cash', note: 'rent' });
    if (dom === 14) entries.push({ t: at(21), type: 'spent', cat: 'Fun', amt: 49900, acc: 'cash', note: 'netflix' });
    if (dom === 20) entries.push({ t: at(19), type: 'spent', cat: 'Fun', amt: 19900, acc: 'cash', note: 'spotify' });
    if (i === 60) entries.push({ t: at(11), type: 'invest', cat: 'Index fund', amt: 2000000, acc: 'cash' });
    if (i === 30) entries.push({ t: at(11), type: 'invest', cat: 'Tesla', amt: 1000000, acc: 'cash' });
    const n = 1 + Math.floor(rnd() * 2);
    for (let j = 0; j < n; j++) {
      let r = rnd(), cat = 'Food';
      for (const [c, w] of weights) { if (r < w) { cat = c; break; } r -= w; }
      const pool = pools[cat], np = notes[cat];
      entries.push({
        t: at(8 + Math.floor(rnd() * 13)), type: 'spent', cat,
        amt: pool[Math.floor(rnd() * pool.length)],
        acc: 'cash',
        note: np[Math.floor(rnd() * np.length)] || undefined,
      });
    }
  }
  entries.push({ t: now - 36e5 * 3, type: 'got', cat: 'Freelance', amt: 1500000, acc: 'cash', note: 'logo work' });
  entries.sort((a, b) => a.t - b.t);
  return {
    ...blank(),
    accounts: [{ id: 'cash', name: 'Cash', init: 4000000 }],
    entries,
    savings: 1500000,
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
      { id: 'r1', note: 'Rent', type: 'spent', cat: 'Bills', amt: 1800000, freq: 'monthly', next: dstr(new Date(now + 3 * day)), auto: true, acc: 'cash' },
      { id: 'r2', note: 'Salary', type: 'got', cat: 'Salary', amt: 8500000, freq: 'monthly', next: dstr(new Date(now + 27 * day)), auto: true, acc: 'cash' },
      { id: 'r3', note: 'Gym', type: 'spent', cat: 'Health', amt: 150000, freq: 'monthly', next: dstr(new Date(now)), auto: false, acc: 'cash' },
      { id: 'r4', note: 'Netflix', type: 'spent', cat: 'Fun', amt: 49900, freq: 'monthly', next: dstr(new Date(now + 16 * day)), auto: true, acc: 'cash' },
    ],
    rules: [{ id: 'rl1', match: 'swiggy', cat: 'Food', type: 'spent' }],
    profile: null, // → onboarding runs on first open
  };
}

function migrate(d) {
  const b = blank();
  for (const k of Object.keys(b)) if (d[k] === undefined) d[k] = b[k];
  if (!Array.isArray(d.accounts) || !d.accounts.length) d.accounts = b.accounts;
  const first = d.accounts[0].id;
  for (const e of d.entries) if (!e.acc) e.acc = first;
  // v3: custom cats are [emoji, name] pairs
  if (!Array.isArray(d.cats)) d.cats = [];
  d.cats = d.cats.filter((x) => Array.isArray(x) && x.length === 2);
  if (typeof d.savings !== 'number' || d.savings < 0) d.savings = 0;
  if (d.profile !== null && (typeof d.profile !== 'object' || typeof d.profile.name !== 'string')) d.profile = null;
  for (const r of d.recurring) {
    if (!r.freq) r.freq = 'monthly';
    if (!r.next) r.next = fmtDate(new Date());
    if (!r.acc) r.acc = first;
  }
  for (const g of d.goals) if (!g.created) g.created = Date.now();
  if (!d.last || typeof d.last !== 'object') d.last = { spent: 'Food', got: 'Salary' };
  if (typeof d.sweep !== 'boolean') d.sweep = true;
  if (typeof d.buzzOn !== 'boolean') d.buzzOn = true;
  if (!Array.isArray(d.pins)) d.pins = [];
  if (!Array.isArray(d.dismissedRec)) d.dismissedRec = [];
  if (!d.dismissedIns || typeof d.dismissedIns !== 'object') d.dismissedIns = {};
  if (typeof d.lastReport !== 'string') d.lastReport = '';
  if (typeof d.surplusDone !== 'string') d.surplusDone = '';
  for (const k of ['moodOn', 'ambientOn', 'offerOn', 'suggestOn']) if (typeof d[k] !== 'boolean') d[k] = true;
  if (!d.moods || typeof d.moods !== 'object') d.moods = {};
  for (const k of ['ok', 'tight', 'low']) if (!Array.isArray(d.moods[k]) || !d.moods[k].length) d.moods[k] = [...MOODS[k]];
  if (typeof d.pin !== 'string' || (d.pin && !/^\d{4}$/.test(d.pin))) d.pin = '';
  // sync custom emoji registry: pairs win
  const reg = {};
  for (const [em, nm] of d.cats) reg[nm] = em;
  setCustomEmoji(reg);
  return d;
}

function processDue(d) {
  const todayS = fmtDate(new Date());
  let n = 0;
  for (const r of d.recurring) {
    if (!r.auto || !r.amt) continue;
    let g = 0;
    while (r.next <= todayS && g++ < 40) {
      d.entries.push({ t: nextMs(r.next), type: r.type, cat: r.cat, amt: r.amt, note: r.note || undefined, acc: r.acc });
      r.next = adv(r.next, r.freq);
      n++;
    }
  }
  return n;
}

// balance = inits + got + unsave − spent − invest − save
export function accBalance(d, a) {
  let b = a.init || 0;
  for (const e of d.entries) {
    if (e.acc !== a.id) continue;
    if (e.type === 'got' || e.type === 'unsave') b += e.amt;
    else if (e.type === 'spent' || e.type === 'invest' || e.type === 'save') b -= e.amt;
  }
  return b;
}

export function totals(d) {
  const now = new Date();
  const ym = monthOf(Date.now());
  let ts = 0, tg = 0, tc = 0, cash = 0, mSpent = 0, mGot = 0, inv = 0;
  for (const a of d.accounts) cash += accBalance(d, a);
  for (const e of d.entries) {
    const ed = new Date(e.t);
    const sameDay = ed.toDateString() === now.toDateString();
    const sameMonth = monthOf(e.t) === ym;
    if (sameDay && e.type !== 'transfer') tc++;
    if (e.type === 'got') { if (sameDay) tg += e.amt; if (sameMonth) mGot += e.amt; }
    else if (e.type === 'spent') { if (sameDay) ts += e.amt; if (sameMonth) mSpent += e.amt; }
    else if (e.type === 'invest') inv += e.amt;
  }
  const invV = d.holdings.reduce((a, h) => a + h.value, 0);
  const debtR = d.debts.reduce((a, x) => a + x.remaining, 0);
  const net = cash + (d.savings || 0) + invV - debtR;
  return { ts, tg, tc, cash, net, invV, inv, debtR, mSpent, mGot, savings: d.savings || 0 };
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(blank);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('log');
  const [toast, setToast] = useState(null);
  const [sweepOffer, setSweepOffer] = useState(null);
  const [onb, setOnb] = useState(null); // onboarding: { step, name, sources, tops, cur } | null
  const undoSnap = useRef(null);
  const toastT = useRef(null);
  const offerT = useRef(null);

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
        if (!d) d = seed();
        migrate(d);
        const n = processDue(d);
        d.snapshots[monthKey(new Date())] = totals(d).net;
        persist(d);
        setData(d);
        if (!d.profile) setOnb({ step: 0, name: '', sources: [], tops: [], cur: d.cur || 'Rs' });
        if (n) show('Auto-logged ' + n + ' recurring');
      })
      .finally(() => setReady(true));
  }, []);

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
  const money = useCallback((c) => data.cur + ((c < 0 ? '−' : '') + Math.round(Math.abs(c) / 100).toLocaleString('en-US')), [data.cur]);
  const accName = useCallback((id) => (data.accounts.find((x) => x.id === id) || { name: '?' }).name, [data.accounts]);
  const catsFor = useCallback((type) => (type === 'got' ? gotSet(data) : allCats(data)).map((x) => x[1]), [data.cats, data.profile]);

  const offerSweep = useCallback((v) => {
    clearTimeout(offerT.current);
    setSweepOffer(v);
    offerT.current = setTimeout(() => setSweepOffer(null), 5000);
  }, []);

  const takeSweepOffer = useCallback(() => {
    setSweepOffer((v) => {
      if (v) {
        clearTimeout(offerT.current);
        update((d) => {
          let rem = v;
          const open = d.goals.filter((g) => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
          for (const g of open) { if (rem <= 0) break; const take = Math.min(g.target - g.saved, rem); g.saved += take; rem -= take; }
          if (rem > 0 && open.length) open[open.length - 1].saved += rem;
        }, '＋' + data.cur + Math.round(v / 100).toLocaleString('en-US') + '  ◎', true);
      }
      return null;
    });
  }, [update, data.cur]);

  // onboarding finish: profile + currency + income recurring stubs (amt 0)
  const finishOnb = useCallback((o) => {
    const nm = o.name.trim();
    update((d) => {
      d.profile = { name: nm, sources: o.sources, tops: o.tops };
      d.cur = o.cur || d.cur;
      if (o.sources.length) d.last.got = o.sources[0];
      for (const s of o.sources) {
        if (!d.recurring.some((r) => r.type === 'got' && r.cat === s)) {
          const nx = new Date();
          nx.setMonth(nx.getMonth() + 1);
          d.recurring.push({ id: 'r' + Date.now() + s, note: s, type: 'got', cat: s, amt: 0, freq: 'monthly', next: fmtDate(nx), auto: false, acc: d.accounts[0].id });
        }
      }
    }, '✓ welcome, ' + nm);
    setOnb(null);
  }, [update]);

  const restoreDemo = useCallback(() => {
    setData((prev) => {
      const fresh = migrate(seed());
      fresh.profile = prev.profile; // keep who you are
      persist(fresh);
      return fresh;
    });
    show('↺ sample data restored');
  }, [show]);

  const value = {
    data, ready, tab, setTab, update, undo, toast, show,
    sweepOffer, offerSweep, takeSweepOffer, restoreDemo,
    onb, setOnb, finishOnb,
    totals: t, money, accName, catsFor,
    accBalance: (a) => accBalance(data, a),
    acc: data.accounts[0] ? data.accounts[0].id : 'cash',
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
