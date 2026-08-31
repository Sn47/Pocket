import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { MOODS, dayLabel, emojiFor, fmt, fmt0, monthOf, timeLabel, uid } from '../util';
import { AmountSheet, EmojiPicker, KeyPad, Micro, Sheet, padAdvance } from '../ui';
import { analyze, billRadar, microLine, reportText, weekBars } from '../logic';

const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

// count-up tween; when revealNonce changes it counts up from 0 (mood reveal)
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

// popIn 250ms: scale 0.7 → 1 with fade, re-runs when `k` changes
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


export default function LogScreen() {
  const { data, sel, setSel, update, totals, money, accName, catsFor, offerSweep } = useStore();
  const { width, height } = useWindowDimensions();
  const short = height < 720;
  const now = new Date();

  const keyH = clamp(44, Math.round(height * 0.055), 52);
  const actH = clamp(56, Math.round(height * 0.072), 68);
  const balSize = clamp(40, Math.round(width * 0.125), 52);
  const amtSize = clamp(38, Math.round(width * 0.115), 48);

  const [amt, setAmt] = useState(0);
  const [cat, setCat] = useState(data.last?.spent || 'Food');
  const [note, setNote] = useState('');
  const [reveal, setReveal] = useState(null);
  const revT = useRef(null);

  const [histOpen, setHistOpen] = useState(false);
  const [dayOff, setDayOff] = useState(null); // day sheet offset
  const [trOpen, setTrOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [newCat, setNewCat] = useState(null); // { type, emoji, name }

  const [flash, setFlash] = useState(null);
  const flashT = useRef(null);
  const flashC = { neg: C.neg, pos: C.pos, inv: C.inv }[flash];
  const doFlash = (type) => {
    clearTimeout(flashT.current);
    setFlash(type);
    flashT.current = setTimeout(() => setFlash(null), 500);
  };

  // money mood: balance hidden by default; tap pops digits in for 10s
  const [balShown, setBalShown] = useState(false);
  const [revealNonce, setRevealNonce] = useState(0);
  const balT = useRef(null);
  const shownCash = useCountUp(totals.cash, revealNonce);
  const balTap = () => {
    buzz();
    clearTimeout(balT.current);
    if (!balShown) {
      setRevealNonce((n) => n + 1); // count up from 0
      setBalShown(true);
      balT.current = setTimeout(() => setBalShown(false), 10000);
    } else setBalShown(false);
  };
  useEffect(() => () => clearTimeout(balT.current), []);

  const A = useMemo(() => analyze(data, now), [data]);

  // mood rotates with (day-of-month + entries-this-month), pool by runway tier
  const mood = useMemo(() => {
    const m = data.moods || MOODS;
    const pools = A.runway >= 3 ? (m.ok || MOODS.ok) : A.runway >= 1 ? (m.tight || MOODS.tight) : (m.low || MOODS.low);
    let logs = 0;
    for (const e of data.entries) if (monthOf(e.t) === A.ym) logs++;
    return pools[(now.getDate() + logs) % pools.length];
  }, [data.entries, data.moods, A.runway]);
  const moodEnabled = data.moodOn !== false;
  const digitsShown = !moodEnabled || balShown;
  const bars = useMemo(() => weekBars(data, now), [data.entries]);
  const micro = useMemo(() => microLine(data, A, now), [data.entries]);
  const radar = useMemo(() => billRadar(data), [data.recurring]);

  // ambient visibility
  const calm = amt <= 0;
  const reportOn = data.lastReport !== String(A.ym) && A.prevSpent > 0;
  const surplusLeft = A.totLim - A.totSp;
  const surplusOn = A.dimNow - A.domNow <= 2 && A.totLim > 0 && surplusLeft > 0 &&
    data.goals.some((g) => g.saved < g.target) && data.surplusDone !== String(A.ym);
  const safeOn = A.totLim > 0;
  // safe-to-spend counts ALL spending this month against total budgeted capacity,
  // not just budgeted categories — an unbudgeted purchase lowers it too
  const safeV = (A.totLim - A.mSpent) / Math.max(1, A.dimNow - A.domNow + 1);
  const eodOn = now.getHours() >= 21 && A.tc > 0;
  const pauseOn = amt > 0 && A.avgIncome > 0 && amt > 0.1 * A.avgIncome;
  const overIfSaved = amt > 0 && data.budgets[cat] && (A.byCat[cat] || 0) + amt > data.budgets[cat];

  // sweep allocation shared by save paths
  const applySweep = (d, sweep) => {
    let rem = sweep;
    const open = d.goals.filter((g) => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
    for (const g of open) { if (rem <= 0) break; const take = Math.min(g.target - g.saved, rem); g.saved += take; rem -= take; }
    if (rem > 0 && open.length) open[open.length - 1].saved += rem;
  };

  const sweepFor = (v) => {
    if (data.sweep === false) return 0;
    const s = (1000 - (v % 1000)) % 1000;
    return s > 0 && data.goals.some((g) => g.saved < g.target) ? s : 0;
  };

  const msgFor = (t, c, v, sweep) => {
    const emoji = emojiFor(c);
    let msg = (t === 'spent' ? '−' : '+') + data.cur + fmt(v) + '  ' + emoji;
    if (t === 'spent' && data.budgets[c] && (A.byCat[c] || 0) + v > data.budgets[c]) msg = '🔥 ' + emoji + ' over budget';
    if (sweep) msg += '   ◎ +' + (sweep / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return msg;
  };

  const saveEntry = (type) => {
    if (amt <= 0) return;
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    const n = note.trim();
    let t = type, c = cat;
    const rule = data.rules.find((r) => n && n.toLowerCase().includes(r.match.toLowerCase()));
    if (rule) { t = rule.type; c = rule.cat; }
    const set = catsFor(t);
    if (!set.includes(c)) c = data.last?.[t] || set[0];
    const sweep = t === 'spent' ? sweepFor(amt) : 0;
    update((d) => {
      d.entries.push({ id: uid(), t: Date.now(), type: t, cat: c, amt, note: n || undefined, acc: sel });
      d.last[t] = c;
      if (sweep) applySweep(d, sweep);
    }, msgFor(t, c, amt, sweep), true);
    doFlash(t === 'spent' ? 'neg' : 'pos');
    // salary sweep offer: income ≥ 10,000 with an open goal
    if (t === 'got' && amt >= 1000000 && data.offerOn !== false && data.goals.some((g) => g.saved < g.target)) offerSweep(Math.round(amt * 0.2));
    setAmt(0); setNote('');
  };

  const repeatEntry = (e) => {
    if (e.type === 'transfer') return;
    update((d) => { d.entries.push({ id: uid(), t: Date.now(), type: e.type, cat: e.cat, amt: e.amt, note: e.note, acc: e.acc }); },
      (e.type === 'spent' ? '−' : e.type === 'got' ? '+' : '↗') + data.cur + fmt(e.amt) + '  ' + (e.type === 'invest' ? '↗' : emojiFor(e.cat)) + ' again', true);
    doFlash(e.type === 'spent' ? 'neg' : e.type === 'invest' ? 'inv' : 'pos');
  };

  const repeatDay = (dayKey) => {
    const items = data.entries.filter((e2) => new Date(e2.t).toDateString() === dayKey && e2.type !== 'transfer');
    if (!items.length) return;
    update((d) => { for (const e2 of items) d.entries.push({ ...e2, id: uid(), t: Date.now() }); },
      '✓ day repeated · ' + items.length + (items.length === 1 ? ' entry' : ' entries'), true);
    doFlash('neg');
  };

  // recent rows
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

  // day sheet data
  const dayData = useMemo(() => {
    if (dayOff === null) return null;
    const dd2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOff);
    const key3 = dd2.toDateString();
    const items = data.entries.map((e, i) => ({ e, i })).filter((x) => new Date(x.e.t).toDateString() === key3 && x.e.type !== 'transfer').sort((a, b) => b.e.t - a.e.t);
    let dsp = 0, dgt = 0;
    for (const x of items) { if (x.e.type === 'spent') dsp += x.e.amt; else if (x.e.type === 'got') dgt += x.e.amt; }
    let w7 = 0;
    for (let j = 0; j < 7; j++) {
      const k4 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - j).toDateString();
      for (const e of data.entries) if (e.type === 'spent' && new Date(e.t).toDateString() === k4) w7 += e.amt;
    }
    const avg7 = w7 / 7;
    const diff = avg7 > 0 && dsp > 0 ? Math.round((dsp / avg7 - 1) * 100) : null;
    return {
      title: '∿  ' + (dayOff === 0 ? 'Today' : dd2.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })),
      sub: '−' + fmt0(dsp) + (dgt > 0 ? ' · +' + fmt0(dgt) : ''),
      line: dsp === 0 ? '🌱 a no-spend day' : '−' + fmt0(dsp) + ' spent' + (diff === null ? '' : ' · ' + (diff >= 0 ? '+' : '') + diff + '% vs your 7-day average'),
      items,
    };
  }, [dayOff, data.entries]);

  const showReveal = (emoji, name) => {
    clearTimeout(revT.current);
    setReveal(emoji + '  ' + name);
    revT.current = setTimeout(() => setReveal(null), 1100);
  };

  const hasAmt = amt > 0;

  const chip = (name, type) => {
    const emoji = emojiFor(name);
    const on = cat === name;
    const lim = type === 'spent' ? data.budgets[name] || 0 : 0;
    const sp = A.byCat[name] || 0;
    const leftV = lim - sp;
    return (
      <Pressable
        key={type + name}
        onPress={() => { buzz(); setCat(name); }}
        onLongPress={() => showReveal(emoji, name)}
        delayLongPress={450}
        style={({ pressed }) => [s.chip, on && { backgroundColor: C.fillSel, borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
      >
        <Text style={{ fontSize: emoji === '✱' ? 16 : 21, lineHeight: 24, color: C.ink2, fontWeight: '700' }}>{emoji}</Text>
        {lim > 0 && (
          <View style={s.chipBar}>
            <View style={{ width: Math.min(100, (sp / lim) * 100) + '%', height: 2, backgroundColor: sp > lim ? C.neg : C.pos }} />
          </View>
        )}
        {on && lim > 0 && (
          <Text style={{ fontSize: 8.5, fontWeight: '700', color: leftV < 0 ? C.neg : C.ink3, fontVariant: ['tabular-nums'], lineHeight: 9 }}>
            {(leftV < 0 ? '−' : '') + fmt0(leftV)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[s.wrap, short && { paddingTop: 8 }]}>
        {/* header */}
        <View style={s.head}>
          <Micro>POCKET</Micro>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {data.accounts.map((a) => (
              <Pressable key={a.id} onPress={() => { buzz(); setSel(a.id); }} hitSlop={8}>
                <Text style={[s.accPill, a.id === sel && { color: C.ink }]}>{a.name.toUpperCase()}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { buzz(); setHistOpen(true); }} style={({ pressed }) => [s.histBtn, pressed && { backgroundColor: C.fillSel }]}>
              <Text style={{ color: C.ink2, fontSize: 25, lineHeight: 28 }}>◷</Text>
            </Pressable>
          </View>
        </View>

        {/* money mood — balance hidden behind an emoji; tap pops digits in (10s) */}
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

        {/* week strip */}
        <View style={s.week}>
          {bars.map((w, i) => (
            <Pressable key={i} onPress={() => { buzz(); setDayOff(w.off); }} style={({ pressed }) => [s.weekHit, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <View style={{ width: 7, borderRadius: 2, height: w.h, backgroundColor: w.c }} />
            </Pressable>
          ))}
        </View>

        {/* ambient layer — calm mode only */}
        {calm && (
          <View>
            {reportOn && (
              <View style={{ alignItems: 'center', marginTop: 18 }}>
                <Pressable onPress={() => { buzz(); update((d) => { d.lastReport = String(A.ym); }); }} style={({ pressed }) => [s.pill, pressed && { opacity: 0.6 }]}>
                  <Text style={s.pillText}>{reportText(data, A, now)}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>  ✕</Text>
                </Pressable>
              </View>
            )}
            {surplusOn && (
              <View style={{ alignItems: 'center', marginTop: 14 }}>
                <View style={[s.pill, { borderWidth: 1, borderColor: 'rgba(48,209,88,0.35)' }]}>
                  <Pressable
                    onPress={() => {
                      buzz();
                      update((d) => { d.surplusDone = String(A.ym); applySweep(d, surplusLeft); }, '＋' + data.cur + fmt(surplusLeft) + '  ◎', true);
                    }}
                  >
                    <Text style={{ color: C.pos, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>◎ move {fmt0(surplusLeft)} surplus to goal</Text>
                  </Pressable>
                  <Pressable onPress={() => { buzz(); update((d) => { d.surplusDone = String(A.ym); }); }} hitSlop={8}>
                    <Text style={{ color: C.ink3, fontSize: 11 }}>  ✕</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {safeOn && data.ambientOn !== false && (
              <Text style={{ textAlign: 'center', marginTop: 22 }}>
                <Text style={{ color: C.ink3, fontSize: 9, fontWeight: '700', letterSpacing: 2 }}>SAFE TODAY{'  '}</Text>
                <Text style={{ color: safeV < 0 ? C.neg : C.ink2, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {(safeV < 0 ? '−' : '') + fmt0(safeV)}
                </Text>
              </Text>
            )}
            {!!micro && data.ambientOn !== false && <Text style={s.microLine}>{micro}</Text>}
            {radar && data.ambientOn !== false && (
              <Text style={[s.microLine, { marginTop: 12 }]}>
                ⏰ {(radar.r.note || radar.r.name || radar.r.cat)}  {(radar.r.type === 'spent' ? '−' : '+') + fmt0(radar.r.amt)} · in {radar.days}d
              </Text>
            )}
            {eodOn && data.ambientOn !== false && <Text style={[s.microLine, { marginTop: 12 }]}>today  −{fmt0(A.ts)}  ·  {A.tc}{A.tc === 1 ? ' entry' : ' entries'}</Text>}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* amount */}
        <View style={s.amtRow}>
          <Text style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
            <Text style={{ color: C.ink3, fontSize: 21, fontWeight: '600' }}>{data.cur}</Text>
            <Text style={{ color: hasAmt ? C.ink : C.ink4, fontSize: amtSize, fontWeight: '700', letterSpacing: -1 }}>{fmt(amt)}</Text>
          </Text>
        </View>
        {pauseOn && (
          <Text style={[s.microLine, { marginTop: 2 }]}>= {(amt / (A.avgIncome / 30)).toFixed(1)} days of income</Text>
        )}

        {/* reveal pill */}
        {reveal && (
          <View style={s.reveal} pointerEvents="none">
            <Text style={s.revealText}>{reveal}</Text>
          </View>
        )}

        {/* emoji chips + note (focus mode) */}
        {hasAmt && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingHorizontal: 2, paddingVertical: 3 }}>
              {catsFor('spent').map((c) => chip(c, 'spent'))}
              <View style={{ width: 1, height: 22, backgroundColor: C.line2 }} />
              {catsFor('got').map((c) => chip(c, 'got'))}
              <Pressable onPress={() => { buzz(); setNewCat({ type: 'spent', emoji: '', name: '' }); }} style={({ pressed }) => [s.chip, pressed && { transform: [{ scale: 0.9 }] }]}>
                <Text style={{ fontSize: 19, color: C.ink4, fontWeight: '700' }}>＋</Text>
              </Pressable>
            </ScrollView>
            <TextInput value={note} onChangeText={setNote} placeholder="note" placeholderTextColor={C.ink4} style={s.note} />
          </View>
        )}

        {/* keypad — hold ⌫ clears */}
        <View style={{ marginTop: 6 }}>
          <KeyPad keyH={keyH} onKey={(k) => setAmt((a) => padAdvance(a, k))} onClear={() => setAmt(0)} />
        </View>

        {/* action row — − deepens red when this save breaks the budget */}
        <View style={[s.actions, { opacity: hasAmt ? 1 : 0.35 }]}>
          <Pressable onPress={() => saveEntry('spent')} style={({ pressed }) => [s.act, { height: actH, backgroundColor: pressed ? C.neg : overIfSaved ? 'rgba(255,69,58,0.32)' : C.negSoft }, pressed && { transform: [{ scale: 0.97 }] }]}>
            {({ pressed }) => <Text style={[s.actGlyph, { color: pressed ? '#000' : C.neg }]}>−</Text>}
          </Pressable>
          <Pressable onPress={() => { buzz(); setTrOpen(true); }} style={({ pressed }) => [s.act, { width: 64, flex: 0, height: actH, backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : C.fill }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Text style={{ color: C.ink2, fontSize: 22 }}>⇆</Text>
          </Pressable>
          <Pressable onPress={() => saveEntry('got')} style={({ pressed }) => [s.act, { height: actH, backgroundColor: pressed ? C.pos : C.posSoft }, pressed && { transform: [{ scale: 0.97 }] }]}>
            {({ pressed }) => <Text style={[s.actGlyph, { color: pressed ? '#000' : C.pos }]}>＋</Text>}
          </Pressable>
        </View>
      </View>

      {/* ---------------------------------------------------------- recent */}
      <Sheet visible={histOpen} onClose={() => setHistOpen(false)} title="◷  Recent" sub={data.entries.length + ' entries'}>
        {!recent.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>No entries yet — type an amount, tap − or ＋.</Text>}
        {recent.map((r) =>
          r.day ? (
            <Pressable key={r.key} onLongPress={() => repeatDay(r.dayKey)} delayLongPress={450}>
              <Micro style={{ marginTop: 16, marginBottom: 2, fontSize: 10, letterSpacing: 1.8 }}>{r.day}</Micro>
            </Pressable>
          ) : (
            <Pressable
              key={r.key}
              onPress={() => { if (r.e.type !== 'transfer') { buzz(); setEdit({ idx: r.i, type: r.e.type === 'got' ? 'got' : 'spent', cat: r.e.cat, amt: r.e.amt }); } }}
              onLongPress={() => update((d) => { d.entries.splice(r.i, 1); }, 'Deleted', true)}
              delayLongPress={450}
              style={({ pressed }) => [s.recRow, pressed && { opacity: 0.55 }]}
            >
              <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: C.ink2 }}>
                {r.e.type === 'transfer' ? '⇆' : r.e.type === 'invest' ? '↗' : emojiFor(r.e.cat)}
              </Text>
              <Text style={{ color: C.ink3, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {r.e.type === 'transfer' ? accName(r.e.from) + ' → ' + accName(r.e.to) : (r.e.note ? r.e.note + ' · ' : '') + timeLabel(r.e.t)}
              </Text>
              <Pressable onPress={() => { buzz(); repeatEntry(r.e); }} hitSlop={6} style={({ pressed }) => [{ paddingVertical: 6, paddingHorizontal: 8, marginVertical: -6, marginHorizontal: -8, borderRadius: 10 }, pressed && { backgroundColor: C.fillSel }]}>
                <Text style={{
                  fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'],
                  color: r.e.type === 'got' ? C.pos : r.e.type === 'invest' ? C.inv : r.e.type === 'transfer' ? C.ink3 : C.ink,
                }}>
                  {(r.e.type === 'spent' ? '−' : r.e.type === 'got' ? '+' : r.e.type === 'invest' ? '↗' : '') + fmt(r.e.amt)}
                </Text>
              </Pressable>
            </Pressable>
          )
        )}
        <Text style={{ color: C.ink4, fontSize: 11, textAlign: 'center', marginTop: 12 }}>tap to edit · hold to delete · tap amount to log again</Text>
      </Sheet>

      {/* ------------------------------------------------------------- day */}
      <Sheet visible={dayOff !== null} onClose={() => setDayOff(null)} title={dayData ? dayData.title : ''} sub={dayData ? dayData.sub : ''}>
        {dayData && (
          <View>
            <Text style={{ color: C.ink2, fontSize: 13, marginTop: 10, fontVariant: ['tabular-nums'] }}>{dayData.line}</Text>
            {dayData.items.map(({ e, i }) => (
              <Pressable
                key={'de' + i}
                onPress={() => { if (e.type !== 'invest') { buzz(); setDayOff(null); setEdit({ idx: i, type: e.type === 'got' ? 'got' : 'spent', cat: e.cat, amt: e.amt }); } }}
                style={({ pressed }) => [s.recRow, pressed && { opacity: 0.55 }]}
              >
                <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{e.type === 'invest' ? '↗' : emojiFor(e.cat)}</Text>
                <Text style={{ color: C.ink3, fontSize: 12, flex: 1 }} numberOfLines={1}>{(e.note ? e.note + ' · ' : '') + timeLabel(e.t)}</Text>
                <Text style={{ fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'], color: e.type === 'got' ? C.pos : e.type === 'invest' ? C.inv : C.ink }}>
                  {(e.type === 'spent' ? '−' : e.type === 'got' ? '+' : '↗') + fmt(e.amt)}
                </Text>
              </Pressable>
            ))}
            {!dayData.items.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>Nothing logged that day.</Text>}
          </View>
        )}
      </Sheet>

      {/* -------------------------------------------------------- transfer */}
      <AmountSheet visible={trOpen} title="⇆  Transfer" cur={data.cur} initial={amt} onClose={() => setTrOpen(false)} actions={[]}>
        {(sheetAmt) => (
          <View>
            <Micro style={{ marginTop: 14, fontSize: 10, letterSpacing: 1.5 }}>
              {'FROM ' + accName(sel).toUpperCase() + ' — TAP DESTINATION TO SEND'}
            </Micro>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {data.accounts.filter((a) => a.id !== sel).map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    if (sheetAmt <= 0) return;
                    buzz();
                    update((d) => { d.entries.push({ id: uid(), t: Date.now(), type: 'transfer', from: sel, to: a.id, amt: sheetAmt }); }, '⇆ ' + fmt(sheetAmt) + ' → ' + a.name, true);
                    setTrOpen(false); setAmt(0);
                  }}
                  style={({ pressed }) => [s.dest, pressed && { backgroundColor: C.ink }]}
                >
                  {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.ink, fontSize: 14, fontWeight: '600' }}>{a.name}</Text>}
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </AmountSheet>

      {/* ---------------------------------------------------- new category */}
      <Sheet visible={!!newCat} onClose={() => setNewCat(null)} title="＋  New category" sub="emoji + name">
        {newCat && (
          <View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[['spent', '−', C.neg], ['got', '＋', C.pos]].map(([tp, g, col]) => (
                <Pressable
                  key={tp}
                  onPress={() => { buzz(); setNewCat({ ...newCat, type: tp }); }}
                  style={({ pressed }) => [s.editChip, { flex: 1, width: undefined }, newCat.type === tp && { backgroundColor: C.fillSel, borderColor: col }, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <Text style={{ color: col, fontSize: 19, fontWeight: '700' }}>{g}</Text>
                </Pressable>
              ))}
            </View>
            <EmojiPicker selected={newCat.emoji} onPick={(em) => setNewCat({ ...newCat, emoji: em })} />
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 24, width: 40, textAlign: 'center', paddingBottom: 8, color: C.ink4 }}>{newCat.emoji || '✱'}</Text>
              <TextInput
                value={newCat.name}
                onChangeText={(v) => setNewCat({ ...newCat, name: v })}
                placeholder="name e.g. Pets"
                placeholderTextColor={C.ink4}
                style={[s.note, { flex: 1, textAlign: 'left' }]}
              />
            </View>
            <Pressable
              onPress={() => {
                const nm = newCat.name.trim();
                const em = newCat.emoji.trim();
                if (!nm) return;
                if (catsFor(newCat.type).includes(nm)) return;
                buzz();
                const tp = newCat.type;
                setNewCat(null);
                update((d) => {
                  d.cats[tp] = d.cats[tp].concat(nm);
                  if (em) d.catEmoji[nm] = em;
                }, '✓ ' + (em || '✱') + ' ' + nm, true);
                setCat(nm);
              }}
              style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
            >
              <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>create</Text>
            </Pressable>
          </View>
        )}
      </Sheet>

      {/* ------------------------------------------------------------ edit */}
      <AmountSheet
        visible={!!edit}
        title="Edit"
        cur={data.cur}
        initial={edit ? edit.amt : 0}
        onClose={() => setEdit(null)}
        actions={[
          { label: '⌫', color: C.neg, bg: C.negSoft, flex: 1, onPress: () => { const i = edit.idx; setEdit(null); update((d) => { d.entries.splice(i, 1); }, 'Deleted', true); } },
          {
            label: 'save', color: '#000', bg: C.ink, flex: 2,
            onPress: (v) => {
              if (v <= 0) return;
              const { idx, cat: c2 } = edit;
              setEdit(null);
              update((d) => { const e = d.entries[idx]; if (e) { e.amt = v; e.cat = c2; } }, '✓ updated', true);
            },
          },
        ]}
      >
        {edit && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingVertical: 3, paddingHorizontal: 2 }}>
            {catsFor(edit.type).map((c) => {
              const e2 = emojiFor(c);
              const on = edit.cat === c;
              return (
                <Pressable key={c} onPress={() => { buzz(); setEdit({ ...edit, cat: c }); }} style={({ pressed }) => [s.editChip, on && { backgroundColor: C.fillSel, borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}>
                  <Text style={{ fontSize: e2 === '✱' ? 15 : 20, color: C.ink2, fontWeight: '700' }}>{e2}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </AmountSheet>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accPill: { color: C.ink4, fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingVertical: 6 },
  histBtn: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginVertical: -10, marginRight: -10 },

  week: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 2, height: 22, marginTop: 20 },
  weekHit: { width: 18, height: 22, alignItems: 'center', justifyContent: 'flex-end', borderRadius: 6 },

  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.fill, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  pillText: { color: C.ink2, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  microLine: { color: C.ink4, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center', marginTop: 14, fontVariant: ['tabular-nums'] },

  reveal: { position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center', zIndex: 60 },
  revealText: { backgroundColor: C.toast, color: C.ink, fontSize: 12, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },

  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 24, minHeight: 56 },

  chip: { width: 44, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1.5, borderColor: 'transparent' },
  chipBar: { width: 20, height: 2, borderRadius: 1, backgroundColor: C.line2, overflow: 'hidden' },

  note: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', color: C.ink, fontSize: 14, textAlign: 'center', paddingVertical: 9, marginTop: 6 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  act: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actGlyph: { fontSize: 32, fontWeight: '700' },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  editChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  createBtn: { height: 54, borderRadius: 16, marginTop: 16, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  dest: { flex: 1, height: 48, borderRadius: 14, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
});
