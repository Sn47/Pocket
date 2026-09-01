import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { MOODS, TINT, allCats, dayLabel, emojiFor, fmt, fmt0, gotSet, monthOf, timeLabel, uid } from '../util';
import { KeyPad, Micro, Sheet, padAdvance } from '../ui';
import { analyze, billRadar, reportText } from '../logic';

const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

// count-up tween; counts from 0 when revealNonce changes (mood reveal)
function useCountUp(target, revealNonce) {
  const [shown, setShown] = useState(target);
  const ref = useRef({ to: target, raf: 0, nonce: revealNonce });
  useEffect(() => {
    const r = ref.current;
    const fromZero = r.nonce !== revealNonce;
    r.nonce = revealNonce;
    if (target === r.to && !fromZero) return;
    cancelAnimationFrame(r.raf);
    const from = fromZero ? 0 : shown;
    r.to = target;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (target - from) * e));
      if (p < 1) r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r.raf);
  }, [target, revealNonce]);
  return shown;
}

function PopIn({ k, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [k]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

// springy staggered bubble entrance (bubbleIn .45s overshoot, 50ms stagger)
function Bubble({ delay, style, onPress, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(v, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ scale: v }] }]}>
      <Pressable onPress={onPress} style={({ pressed }) => [s.bubbleInner, pressed && { transform: [{ scale: 0.85 }] }]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function LogScreen() {
  const { data, acc, update, totals, money, accName, catsFor, offerSweep } = useStore();
  const { width, height } = useWindowDimensions();
  const short = height < 720;
  const now = new Date();

  const balSize = clamp(40, Math.round(width * 0.125), 52);

  // sheets
  const [logSheet, setLogSheet] = useState(null); // { type: 'spent'|'got', cat }
  const [sAmt, setSAmt] = useState(0);
  const [note, setNote] = useState('');
  const [histOpen, setHistOpen] = useState(false);
  const [dayOff, setDayOff] = useState(null);
  const [edit, setEdit] = useState(null);

  // balance flash + mood
  const [flash, setFlash] = useState(null);
  const flashT = useRef(null);
  const flashC = { neg: C.neg, pos: C.pos, inv: C.inv }[flash];
  const doFlash = (type) => {
    clearTimeout(flashT.current);
    setFlash(type);
    flashT.current = setTimeout(() => setFlash(null), 500);
  };
  const [balShown, setBalShown] = useState(false);
  const [revealNonce, setRevealNonce] = useState(0);
  const balT = useRef(null);
  const shownCash = useCountUp(totals.cash, revealNonce);
  const moodEnabled = data.moodOn !== false;
  const digitsShown = !moodEnabled || balShown;
  const balTap = () => {
    if (!moodEnabled) return;
    buzz();
    clearTimeout(balT.current);
    if (!balShown) {
      setRevealNonce((n) => n + 1);
      setBalShown(true);
      balT.current = setTimeout(() => setBalShown(false), 10000);
    } else setBalShown(false);
  };
  useEffect(() => () => clearTimeout(balT.current), []);

  const A = useMemo(() => analyze(data, now), [data]);

  const mood = useMemo(() => {
    const m = data.moods || MOODS;
    const pools = A.runway >= 3 ? (m.ok || MOODS.ok) : A.runway >= 1 ? (m.tight || MOODS.tight) : (m.low || MOODS.low);
    let logs = 0;
    for (const e of data.entries) if (monthOf(e.t) === A.ym) logs++;
    return pools[(now.getDate() + logs) % pools.length];
  }, [data.entries, data.moods, A.runway]);

  // 7-day soft spark
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dd0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      let sp = 0;
      for (const e of data.entries) if (e.type === 'spent' && new Date(e.t).toDateString() === dd0.toDateString()) sp += e.amt;
      days.push(sp / 100);
    }
    return days;
  }, [data.entries]);

  const sparkPath = useMemo(() => {
    const vals = weekDays;
    const min = Math.min(...vals, 0), max = Math.max(...vals, 0), span = max - min || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 96, 20 - 3 - ((v - min) / span) * 14]);
    return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  }, [weekDays]);

  // ---- pulse line: bill ≤3d → streak → daily rotation --------------------
  const pulseLine = useMemo(() => {
    const nm = data.profile && data.profile.name ? data.profile.name : '';
    const soon = billRadar(data);
    if (soon && soon.days <= 3) return '⏰ ' + (soon.r.note || soon.r.cat) + '  ' + (soon.r.type === 'spent' ? '−' : '+') + fmt0(soon.r.amt) + ' · in ' + soon.days + 'd';
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const key = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toDateString();
      if (data.entries.some((e) => e.type === 'spent' && new Date(e.t).toDateString() === key)) break;
      streak++;
    }
    if (streak >= 2) return '🌱 ' + streak + ' no-spend days' + (nm ? ' — quiet hands, ' + nm : '');
    const rate = A.mGot > 0 ? Math.round(((A.mGot - A.mSpent) / A.mGot) * 100) : null;
    const og = [...data.goals].filter((g) => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target))[0];
    const opts = [];
    if (rate !== null && rate > 0) opts.push("you kept " + rate + "% of this month's income");
    if (og) opts.push('◎ ' + og.name.toLowerCase() + ' is ' + Math.round((og.saved / og.target) * 100) + '% there — keep going');
    if (A.totLim > 0) {
      const v = (A.totLim - A.mSpent) / Math.max(1, A.dimNow - A.domNow + 1);
      opts.push('safe to spend today  ' + (v < 0 ? '−' : '') + fmt0(v));
    }
    if (A.domNow >= 3 && A.mSpent > 0) opts.push('at this pace  −' + fmt0((A.mSpent / A.domNow) * A.dimNow) + ' this month');
    const topC = A.catList[0];
    if (topC) opts.push(emojiFor(topC) + ' ' + topC.toLowerCase() + ' is winning this month — ' + Math.round(((A.byCat[topC] || 0) / (A.mSpent || 1)) * 100) + '% of spend');
    let chai = 0, big = null;
    for (const e of data.entries) {
      if (e.type !== 'spent' || monthOf(e.t) !== A.ym) continue;
      if ((e.note || '').toLowerCase().includes('chai')) chai++;
      if (!big || e.amt > big.amt) big = e;
    }
    if (chai >= 3) opts.push('☕ chai count: ' + chai + ' this month');
    if (big && big.amt > A.mSpent * 0.15) opts.push('biggest hit: −' + fmt0(big.amt) + '  ' + emojiFor(big.cat));
    if (now.getDay() === 1) opts.push('your wallet survived the weekend 🎉');
    if (now.getDate() <= 3 && nm) opts.push('fresh month, fresh ledger, ' + nm);
    if (!opts.length) return nm ? 'log it the moment it happens, ' + nm : 'log it the moment it happens';
    return opts[now.getDate() % opts.length];
  }, [data, A]);

  const reportOn = data.lastReport !== String(A.ym) && A.prevSpent > 0;
  const surplusLeft = A.totLim - A.totSp;
  const surplusOn = A.dimNow - A.domNow <= 2 && A.totLim > 0 && surplusLeft > 0 &&
    data.goals.some((g) => g.saved < g.target) && data.surplusDone !== String(A.ym);

  // ---- bubble cluster: 90d usage ×10 + onboarding top ×5, Other last ------
  const spendSet = useMemo(() => {
    const cnt90 = {};
    for (const e of data.entries) if (e.type === 'spent' && e.t > Date.now() - 90 * 864e5) cnt90[e.cat] = (cnt90[e.cat] || 0) + 1;
    const tops = (data.profile && data.profile.tops) || [];
    const CATS = allCats(data);
    return [...CATS].sort((a, b) => {
      if (a[1] === 'Other') return 1;
      if (b[1] === 'Other') return -1;
      const sa = (cnt90[a[1]] || 0) * 10 + (tops.includes(a[1]) ? 5 : 0);
      const sb = (cnt90[b[1]] || 0) * 10 + (tops.includes(b[1]) ? 5 : 0);
      return sb - sa || CATS.indexOf(a) - CATS.indexOf(b);
    });
  }, [data.entries, data.cats, data.profile]);

  const bubbles = useMemo(() => spendSet.map(([e, n], i) => {
    const sz = i === 0 ? 84 : i < 3 ? 68 : n === 'Other' ? 50 : 58;
    const cx = 150, cy = 120, R = i === 0 ? 0 : 88;
    const ang = ((i - 1) / Math.max(7, spendSet.length - 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      e, n, size: sz, fs: Math.round(sz * 0.42),
      x: Math.round(cx + R * Math.cos(ang) - sz / 2),
      y: Math.round(cy + R * Math.sin(ang) - sz / 2),
      bg: TINT[n] || 'rgba(255,255,255,0.06)',
      delay: i * 50,
    };
  }), [spendSet]);

  const clusterScale = Math.min(1, (width - 40) / 300);

  // ---------------------------------------------------------------- saving --
  const applySweep = (d, sweep) => {
    let rem = sweep;
    const open = d.goals.filter((g) => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
    for (const g of open) { if (rem <= 0) break; const take = Math.min(g.target - g.saved, rem); g.saved += take; rem -= take; }
    if (rem > 0 && open.length) open[open.length - 1].saved += rem;
  };

  const logSave = () => {
    if (!logSheet || sAmt <= 0) return;
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    const n = note.trim();
    let t = logSheet.type, c = logSheet.cat;
    const rule = data.rules.find((r) => n && n.toLowerCase().includes(r.match.toLowerCase()));
    if (rule) { t = rule.type; c = rule.cat; }
    const set = (t === 'got' ? gotSet(data) : allCats(data)).map((x) => x[1]);
    if (!set.includes(c)) c = data.last?.[t] || set[0];
    const emoji = emojiFor(c);
    let msg = (t === 'spent' ? '−' : '+') + data.cur + fmt(sAmt) + '  ' + emoji;
    if (t === 'spent' && data.budgets[c] && (A.byCat[c] || 0) + sAmt > data.budgets[c]) msg = '🔥 ' + emoji + ' over budget';
    let sweep = 0;
    if (t === 'spent' && data.sweep !== false) {
      sweep = (1000 - (sAmt % 1000)) % 1000;
      if (sweep > 0 && data.goals.some((g) => g.saved < g.target)) msg += '   ◎ +' + (sweep / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
      else sweep = 0;
    }
    const amt = sAmt;
    update((d) => {
      d.entries.push({ id: uid(), t: Date.now(), type: t, cat: c, amt, note: n || undefined, acc });
      d.last[t] = c;
      // income fills its onboarding stub, or becomes a monthly recurring
      if (t === 'got') {
        const stub = d.recurring.find((r) => r.type === 'got' && r.cat === c && r.amt === 0);
        if (stub) stub.amt = amt;
        else if (!d.recurring.some((r) => r.type === 'got' && r.cat === c && r.amt === amt)) {
          const nx = new Date();
          nx.setMonth(nx.getMonth() + 1);
          d.recurring.push({ id: uid(), note: n ? n.charAt(0).toUpperCase() + n.slice(1) : c, type: 'got', cat: c, amt, freq: 'monthly', next: nx.getFullYear() + '-' + String(nx.getMonth() + 1).padStart(2, '0') + '-' + String(nx.getDate()).padStart(2, '0'), auto: false, acc });
        }
      }
      if (sweep) applySweep(d, sweep);
    }, msg, true);
    doFlash(t === 'spent' ? 'neg' : 'pos');
    if (t === 'got' && amt >= 1000000 && data.offerOn !== false && data.goals.some((g) => g.saved < g.target)) offerSweep(Math.round(amt * 0.2));
    setLogSheet(null); setSAmt(0); setNote('');
  };

  const repeatEntry = (e) => {
    if (e.type === 'save' || e.type === 'unsave') return;
    update((d) => { d.entries.push({ id: uid(), t: Date.now(), type: e.type, cat: e.cat, amt: e.amt, note: e.note, acc: e.acc }); },
      (e.type === 'spent' ? '−' : e.type === 'got' ? '+' : '↗') + data.cur + fmt(e.amt) + '  ' + (e.type === 'invest' ? '↗' : emojiFor(e.cat)) + ' again', true);
    doFlash(e.type === 'spent' ? 'neg' : e.type === 'invest' ? 'inv' : 'pos');
  };

  const repeatDay = (dayKey) => {
    const items = data.entries.filter((e2) => new Date(e2.t).toDateString() === dayKey && e2.type !== 'save' && e2.type !== 'unsave');
    if (!items.length) return;
    update((d) => { for (const e2 of items) d.entries.push({ ...e2, id: uid(), t: Date.now() }); },
      '✓ day repeated · ' + items.length + (items.length === 1 ? ' entry' : ' entries'), true);
    doFlash('neg');
  };

  // recent + day sheet data
  const recent = useMemo(() => {
    const sorted = data.entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.t - a.e.t).slice(0, 30);
    const out = [];
    let d0 = null;
    for (const { e, i } of sorted) {
      const k = new Date(e.t).toDateString();
      if (k !== d0) { out.push({ day: dayLabel(k), dayKey: k, key: 'd' + k }); d0 = k; }
      out.push({ e, i, key: 'e' + i });
    }
    return out;
  }, [data.entries]);

  const dayData = useMemo(() => {
    if (dayOff === null) return null;
    const dd2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOff);
    const key3 = dd2.toDateString();
    const items = data.entries.map((e, i) => ({ e, i })).filter((x) => new Date(x.e.t).toDateString() === key3).sort((a, b) => b.e.t - a.e.t);
    let dsp = 0, dgt = 0;
    for (const x of items) { if (x.e.type === 'spent') dsp += x.e.amt; else if (x.e.type === 'got') dgt += x.e.amt; }
    let w7 = 0;
    for (let j = 0; j < 7; j++) {
      const k4 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - j).toDateString();
      for (const e of data.entries) if (e.type === 'spent' && new Date(e.t).toDateString() === k4) w7 += e.amt;
    }
    const avg7 = w7 / 7;
    const diff = avg7 > 0 && dsp > 0 ? Math.round((dsp / avg7 - 1) * 100) : null;
    const nm = data.profile && data.profile.name ? ', ' + data.profile.name : '';
    return {
      title: '∿  ' + (dayOff === 0 ? 'Today' : dd2.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })),
      sub: '−' + fmt0(dsp) + (dgt > 0 ? ' · +' + fmt0(dgt) : ''),
      line: dsp === 0 ? '🌱 a no-spend day' + nm : '−' + fmt0(dsp) + ' spent' + (diff === null ? '' : ' · ' + (diff >= 0 ? '+' : '') + diff + '% vs your 7-day average'),
      items,
    };
  }, [dayOff, data.entries]);

  const brandLine = data.profile && data.profile.name ? 'POCKET · ' + data.profile.name.toUpperCase() : 'POCKET';
  const budLeft = logSheet && logSheet.type === 'spent' && data.budgets[logSheet.cat]
    ? fmt0(data.budgets[logSheet.cat] - (A.byCat[logSheet.cat] || 0)) + ' left this month' : '';

  const entryGlyph = (e) => e.type === 'invest' ? '↗' : e.type === 'save' || e.type === 'unsave' ? '🏦' : emojiFor(e.cat);
  const entrySign = (e) => e.type === 'spent' ? '−' : e.type === 'got' ? '+' : e.type === 'invest' ? '↗' : e.type === 'save' ? '→' : '←';
  const entryColor = (e) => e.type === 'got' ? C.pos : e.type === 'invest' ? C.inv : e.type === 'save' || e.type === 'unsave' ? C.ink2 : C.ink;

  return (
    <View style={[s.wrap, short && { paddingTop: 8 }]}>
      {/* header */}
      <View style={s.head}>
        <Micro>{brandLine}</Micro>
        <Pressable onPress={() => { buzz(); setHistOpen(true); }} style={({ pressed }) => [s.histBtn, pressed && { backgroundColor: C.fillSel }]}>
          <Text style={{ color: C.ink2, fontSize: 25, lineHeight: 28 }}>◷</Text>
        </Pressable>
      </View>

      {/* money mood balance */}
      <Pressable disabled={!moodEnabled} onPress={balTap} style={({ pressed }) => [{ marginTop: short ? 14 : 26, alignItems: 'center', transform: [{ scale: flash ? 1.03 : 1 }] }, pressed && { opacity: 0.7 }]}>
        <Micro dim style={{ fontSize: 9, letterSpacing: 2.5, marginBottom: 10 }}>
          {digitsShown ? 'BALANCE' : 'MONEY MOOD · TAP FOR DIGITS'}
        </Micro>
        {digitsShown ? (
          <PopIn k={'d' + revealNonce}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'], lineHeight: balSize + 4 }}>
              <Text style={{ color: C.ink3, fontSize: 18, fontWeight: '600' }}>{data.cur}</Text>
              <Text style={{ color: flashC || C.ink, fontSize: balSize, fontWeight: '700', letterSpacing: -1.5 }}>
                {shownCash < 0 ? '−' : ''}{fmt(shownCash)}
              </Text>
            </Text>
          </PopIn>
        ) : (
          <PopIn k={'m' + mood}>
            <Text style={{ fontSize: Math.round(balSize * 0.9), lineHeight: Math.round(balSize * 1.05) }}>{mood}</Text>
          </PopIn>
        )}
      </Pressable>

      {/* 7-day soft spark → today's day sheet */}
      <Pressable onPress={() => { buzz(); setDayOff(0); }} style={({ pressed }) => [{ alignItems: 'center', marginTop: 12 }, pressed && { opacity: 0.6 }]}>
        <Svg width={96} height={20} viewBox="0 0 96 20">
          <Path d={sparkPath + ' L96 20 L0 20 Z'} fill="rgba(245,245,247,0.12)" />
          <Path d={sparkPath} stroke="rgba(245,245,247,0.32)" strokeWidth={1.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </Pressable>

      {/* ambient — report pill, surplus pill, one pulse line */}
      {reportOn && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Pressable onPress={() => { buzz(); update((d) => { d.lastReport = String(A.ym); }); }} style={({ pressed }) => [s.pill, pressed && { opacity: 0.6 }]}>
            <Text style={s.pillText}>{reportText(data, A, now)}</Text>
            <Text style={{ color: C.ink3, fontSize: 11 }}>  ✕</Text>
          </Pressable>
        </View>
      )}
      {surplusOn && (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <View style={[s.pill, { borderWidth: 1, borderColor: 'rgba(48,209,88,0.35)' }]}>
            <Pressable onPress={() => { buzz(); update((d) => { d.surplusDone = String(A.ym); applySweep(d, surplusLeft); }, '＋' + data.cur + fmt(surplusLeft) + '  ◎', true); }}>
              <Text style={{ color: C.pos, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>◎ move {fmt0(surplusLeft)} surplus to goal</Text>
            </Pressable>
            <Pressable onPress={() => { buzz(); update((d) => { d.surplusDone = String(A.ym); }); }} hitSlop={8}>
              <Text style={{ color: C.ink3, fontSize: 11 }}>  ✕</Text>
            </Pressable>
          </View>
        </View>
      )}
      {data.ambientOn !== false && (
        <Text style={s.pulse}>{pulseLine}</Text>
      )}

      <View style={{ flex: 1 }} />

      {/* bubble cluster */}
      <Micro dim style={{ textAlign: 'center', letterSpacing: 1.8, paddingTop: 20 }}>what was it?</Micro>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 300, height: 238, marginTop: 4, transform: [{ scale: clusterScale }] }}>
          {bubbles.map((b) => (
            <Bubble
              key={b.n}
              delay={b.delay}
              style={{ position: 'absolute', left: b.x, top: b.y, width: b.size, height: b.size }}
              onPress={() => { buzz(); setSAmt(0); setNote(''); setLogSheet({ type: 'spent', cat: b.n }); }}
            >
              <View style={[s.bubble, { width: b.size, height: b.size, backgroundColor: b.bg }]}>
                <Text style={{ fontSize: b.fs }}>{b.e}</Text>
              </View>
            </Bubble>
          ))}
        </View>
      </View>

      {/* MONEY IN */}
      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
        <Pressable
          onPress={() => { buzz(); setSAmt(0); setNote(''); setLogSheet({ type: 'got', cat: gotSet(data)[0][1] }); }}
          style={({ pressed }) => [s.moneyIn, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
        >
          <Text style={{ color: C.pos, fontSize: 15, fontWeight: '700' }}>＋</Text>
          <Text style={{ color: C.pos, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>MONEY IN</Text>
        </Pressable>
      </View>

      {/* ----------------------------------------------------------- log sheet */}
      <Sheet
        visible={!!logSheet}
        onClose={() => setLogSheet(null)}
        title={logSheet ? (logSheet.type === 'got' ? '＋  Money in' : emojiFor(logSheet.cat) + '  ' + logSheet.cat) : ''}
        sub={budLeft}
      >
        {logSheet && (
          <View>
            {logSheet.type === 'got' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingVertical: 3, paddingHorizontal: 2 }}>
                {gotSet(data).map(([e, n]) => (
                  <Pressable
                    key={n}
                    onPress={() => { buzz(); setLogSheet({ ...logSheet, cat: n }); }}
                    style={({ pressed }) => [s.gotChip, logSheet.cat === n && { backgroundColor: C.fillSel, borderColor: C.ink }, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <Text style={{ fontSize: 16 }}>{e}</Text>
                    <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>{n}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ marginTop: 12 }}>
              <Text style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={{ color: C.ink3, fontSize: 20, fontWeight: '600' }}>{data.cur}</Text>
                <Text style={{ color: sAmt > 0 ? C.ink : C.ink4, fontSize: 54, fontWeight: '700', letterSpacing: -1.5 }}>{fmt(sAmt)}</Text>
              </Text>
            </View>
            <TextInput value={note} onChangeText={setNote} placeholder="note (optional)" placeholderTextColor={C.ink4} style={s.note} />
            <View style={{ marginTop: 8 }}>
              <KeyPad keyH={clamp(52, Math.round(height * 0.07), 64)} radius={18} big onKey={(k) => setSAmt((a) => padAdvance(a, k))} onClear={() => setSAmt(0)} />
            </View>
            <Pressable
              onPress={logSave}
              style={({ pressed }) => [
                s.logSave,
                { backgroundColor: sAmt > 0 ? (logSheet.type === 'got' ? 'rgba(48,209,88,0.18)' : 'rgba(255,69,58,0.18)') : 'rgba(255,255,255,0.05)' },
                pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 },
              ]}
            >
              <Text style={{ color: sAmt > 0 ? (logSheet.type === 'got' ? C.pos : C.neg) : C.ink4, fontSize: 19, fontWeight: '800' }}>
                {logSheet.type === 'got' ? '＋ log income' : '− log ' + String(logSheet.cat).toLowerCase()}
              </Text>
            </Pressable>
          </View>
        )}
      </Sheet>

      {/* -------------------------------------------------------- recent sheet */}
      <Sheet visible={histOpen} onClose={() => setHistOpen(false)} title="◷  Recent" sub={data.entries.length + ' entries'}>
        {!recent.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>No entries yet — tap a bubble.</Text>}
        {recent.map((r) =>
          r.day ? (
            <Pressable key={r.key} onLongPress={() => repeatDay(r.dayKey)} delayLongPress={450}>
              <Micro style={{ marginTop: 16, marginBottom: 2, fontSize: 10, letterSpacing: 1.8 }}>{r.day}</Micro>
            </Pressable>
          ) : (
            <Pressable
              key={r.key}
              onPress={() => { if (r.e.type !== 'save' && r.e.type !== 'unsave') { buzz(); setHistOpen(false); setEdit({ idx: r.i, type: r.e.type === 'got' ? 'got' : 'spent', cat: r.e.cat, amt: r.e.amt }); } }}
              onLongPress={() => update((d) => { d.entries.splice(r.i, 1); }, 'Deleted', true)}
              delayLongPress={450}
              style={({ pressed }) => [s.recRow, pressed && { opacity: 0.55 }]}
            >
              <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: C.ink2 }}>{entryGlyph(r.e)}</Text>
              <Text style={{ color: C.ink3, fontSize: 12, flex: 1 }} numberOfLines={1}>{(r.e.note ? r.e.note + ' · ' : '') + timeLabel(r.e.t)}</Text>
              <Pressable onPress={() => { buzz(); repeatEntry(r.e); }} hitSlop={6} style={({ pressed }) => [{ paddingVertical: 6, paddingHorizontal: 8, marginVertical: -6, marginHorizontal: -8, borderRadius: 10 }, pressed && { backgroundColor: C.fillSel }]}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'], color: entryColor(r.e) }}>
                  {entrySign(r.e)}{fmt(r.e.amt)}
                </Text>
              </Pressable>
            </Pressable>
          )
        )}
        <Text style={{ color: C.ink4, fontSize: 11, textAlign: 'center', marginTop: 12 }}>tap to edit · hold to delete · tap amount to log again</Text>
      </Sheet>

      {/* ----------------------------------------------------------- day sheet */}
      <Sheet visible={dayOff !== null} onClose={() => setDayOff(null)} title={dayData ? dayData.title : ''} sub={dayData ? dayData.sub : ''}>
        {dayData && (
          <View>
            <Text style={{ color: C.ink2, fontSize: 13, marginTop: 10, fontVariant: ['tabular-nums'] }}>{dayData.line}</Text>
            {dayData.items.map(({ e, i }) => (
              <Pressable
                key={'de' + i}
                onPress={() => { if (e.type === 'spent' || e.type === 'got') { buzz(); setDayOff(null); setEdit({ idx: i, type: e.type, cat: e.cat, amt: e.amt }); } }}
                style={({ pressed }) => [s.recRow, pressed && { opacity: 0.55 }]}
              >
                <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{entryGlyph(e)}</Text>
                <Text style={{ color: C.ink3, fontSize: 12, flex: 1 }} numberOfLines={1}>{(e.note ? e.note + ' · ' : '') + timeLabel(e.t)}</Text>
                <Text style={{ fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'], color: entryColor(e) }}>{entrySign(e)}{fmt(e.amt)}</Text>
              </Pressable>
            ))}
            {!dayData.items.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>Nothing logged that day.</Text>}
          </View>
        )}
      </Sheet>

      {/* ---------------------------------------------------------- edit sheet */}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="Edit" sub="">
        {edit && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingVertical: 3, paddingHorizontal: 2 }}>
              {(edit.type === 'got' ? gotSet(data) : allCats(data)).map(([e2, c]) => (
                <Pressable key={c} onPress={() => { buzz(); setEdit({ ...edit, cat: c }); }} style={({ pressed }) => [s.editChip, edit.cat === c && { backgroundColor: C.fillSel, borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}>
                  <Text style={{ fontSize: e2 === '✱' ? 15 : 20, color: C.ink2, fontWeight: '700' }}>{e2}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: 10 }}>
              <Text style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={{ color: C.ink3, fontSize: 17, fontWeight: '600' }}>{data.cur}</Text>
                <Text style={{ color: edit.amt > 0 ? C.ink : C.ink4, fontSize: 38, fontWeight: '700', letterSpacing: -1 }}>{fmt(edit.amt)}</Text>
              </Text>
            </View>
            <KeyPad keyH={46} radius={14} onKey={(k) => setEdit((x) => ({ ...x, amt: padAdvance(x.amt, k) }))} onClear={() => setEdit((x) => ({ ...x, amt: 0 }))} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => { buzz(); const i = edit.idx; setEdit(null); update((d) => { d.entries.splice(i, 1); }, 'Deleted', true); }} style={({ pressed }) => [s.sheetAct, { flex: 1, backgroundColor: C.negSoft }, pressed && { opacity: 0.8 }]}>
                <Text style={{ color: C.neg, fontSize: 17 }}>⌫</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (edit.amt <= 0) return;
                  buzz();
                  const { idx, cat: c2, amt } = edit;
                  setEdit(null);
                  update((d) => { const e = d.entries[idx]; if (e) { e.amt = amt; e.cat = c2; } }, '✓ updated', true);
                }}
                style={({ pressed }) => [s.sheetAct, { flex: 2, backgroundColor: C.ink }, pressed && { opacity: 0.8 }]}
              >
                <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>save</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histBtn: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginVertical: -10, marginRight: -10 },

  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.fill, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  pillText: { color: C.ink2, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  pulse: { color: C.ink3, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 24, paddingHorizontal: 30, lineHeight: 18, fontVariant: ['tabular-nums'] },

  bubbleInner: { flex: 1 },
  bubble: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  moneyIn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: 'rgba(48,209,88,0.12)' },

  gotChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'transparent' },
  note: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', color: C.ink, fontSize: 14, textAlign: 'center', paddingVertical: 8, marginTop: 4 },
  logSave: { height: 70, borderRadius: 24, marginTop: 10, alignItems: 'center', justifyContent: 'center' },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  editChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  sheetAct: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
