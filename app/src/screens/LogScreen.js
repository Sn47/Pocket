import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { dayLabel, emojiFor, fmt, fmt0, monthOf, quickAmounts, timeLabel, uid } from '../util';
import { AmountSheet, KeyPad, Micro, Sheet, padAdvance } from '../ui';

const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

// count-up tween for the balance (450ms cubic ease-out, as the prototype)
function useCountUp(target) {
  const [shown, setShown] = useState(target);
  const ref = useRef({ to: target, raf: 0 });
  useEffect(() => {
    const r = ref.current;
    if (target === r.to) return;
    cancelAnimationFrame(r.raf);
    const from = shown;
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
  }, [target]);
  return shown;
}

export default function LogScreen() {
  const { data, sel, setSel, update, totals, money, accName, catsFor } = useStore();
  const { width, height } = useWindowDimensions();
  const short = height < 720;

  // responsive clamps (design sizes on regular phones, scaled on small ones)
  const keyH = clamp(44, Math.round(height * 0.058), 52);
  const actH = clamp(56, Math.round(height * 0.075), 68);
  const balSize = clamp(40, Math.round(width * 0.125), 52);
  const amtSize = clamp(38, Math.round(width * 0.115), 48);

  // entry state — single selected category, exactly like the prototype
  const [amt, setAmt] = useState(0);
  const [cat, setCat] = useState(data.last?.spent || 'Food');
  const [note, setNote] = useState('');
  const [reveal, setReveal] = useState(null);
  const revT = useRef(null);

  // sheets
  const [histOpen, setHistOpen] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const [edit, setEdit] = useState(null); // { idx, type, cat, amt }

  // balance flash + count-up
  const [flash, setFlash] = useState(null);
  const flashT = useRef(null);
  const shownCash = useCountUp(totals.cash);
  const flashC = { neg: C.neg, pos: C.pos, inv: C.inv }[flash];
  const doFlash = (type) => {
    clearTimeout(flashT.current);
    setFlash(type);
    flashT.current = setTimeout(() => setFlash(null), 500);
  };

  const quick = useMemo(() => quickAmounts(data.entries), [data.entries]);

  const byCat = useMemo(() => {
    const ym = monthOf(Date.now());
    const m = {};
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === ym) m[e.cat] = (m[e.cat] || 0) + e.amt;
    return m;
  }, [data.entries]);

  // --------------------------------------------------------------- saving --
  const saveEntry = (type) => {
    if (amt <= 0) return;
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    const n = note.trim();
    let t = type, c = cat;
    const rule = data.rules.find((r) => n && n.toLowerCase().includes(r.match.toLowerCase()));
    if (rule) { t = rule.type; c = rule.cat; }
    const set = catsFor(t);
    if (!set.includes(c)) c = data.last?.[t] || set[0];
    const emoji = emojiFor(c);

    let msg = (t === 'spent' ? '−' : '+') + data.cur + fmt(amt) + '  ' + emoji;
    if (t === 'spent' && data.budgets[c]) {
      let sp = amt;
      for (const e of data.entries) if (e.type === 'spent' && e.cat === c && monthOf(e.t) === monthOf(Date.now())) sp += e.amt;
      if (sp > data.budgets[c]) msg = '🔥 ' + emoji + ' over budget';
    }

    // round-up sweep: spare change up to the next 10 → nearest-to-done goal
    let sweep = 0;
    if (t === 'spent' && data.sweep !== false) {
      sweep = (1000 - (amt % 1000)) % 1000;
      const open = data.goals.filter((g) => g.saved < g.target);
      if (sweep > 0 && open.length) msg += '   ◎ +' + (sweep / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
      else sweep = 0;
    }

    update((d) => {
      d.entries.push({ id: uid(), t: Date.now(), type: t, cat: c, amt, note: n || undefined, acc: sel });
      d.last[t] = c;
      if (sweep > 0) {
        let rem = sweep;
        const open = d.goals.filter((g) => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
        for (const g of open) {
          if (rem <= 0) break;
          const take = Math.min(g.target - g.saved, rem);
          g.saved += take; rem -= take;
        }
        if (rem > 0 && open.length) open[open.length - 1].saved += rem;
      }
    }, msg, true);
    doFlash(t === 'spent' ? 'neg' : 'pos');
    setAmt(0); setNote('');
  };

  const doInvest = () => {
    if (amt <= 0) return;
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    update((d) => { d.entries.push({ id: uid(), t: Date.now(), type: 'invest', cat: 'Invested', amt, acc: sel }); },
      '↗' + data.cur + fmt(amt) + ' invested', true);
    doFlash('inv');
    setAmt(0);
  };

  // --------------------------------------------------------------- recent --
  const recent = useMemo(() => {
    const sorted = data.entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.t - a.e.t).slice(0, 30);
    const out = [];
    let day = null;
    for (const { e, i } of sorted) {
      const k = new Date(e.t).toDateString();
      if (k !== day) { out.push({ day: dayLabel(k), key: 'd' + k }); day = k; }
      out.push({ e, i, key: 'e' + i });
    }
    return out;
  }, [data.entries]);

  const showReveal = (emoji, name) => {
    clearTimeout(revT.current);
    setReveal(emoji + '  ' + name);
    revT.current = setTimeout(() => setReveal(null), 1100);
  };

  const hasAmt = amt > 0;
  const balInt = fmt(shownCash);

  // 44×56 emoji chip — bar for budgeted spent cats, amount-left when selected
  const chip = (name, type) => {
    const emoji = emojiFor(name);
    const on = cat === name;
    const lim = type === 'spent' ? data.budgets[name] || 0 : 0;
    const sp = byCat[name] || 0;
    const leftV = lim - sp;
    return (
      <Pressable
        key={type + name}
        onPress={() => { buzz(); setCat(name); }}
        onLongPress={() => showReveal(emoji, name)}
        delayLongPress={450}
        style={({ pressed }) => [
          s.chip,
          on && { backgroundColor: C.fillSel, borderColor: C.ink },
          pressed && { transform: [{ scale: 0.9 }] },
        ]}
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
        {/* ------------------------------------------------------------ header */}
        <View style={s.head}>
          <Micro>POCKET</Micro>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {data.accounts.map((a) => (
              <Pressable key={a.id} onPress={() => { buzz(); setSel(a.id); }} hitSlop={8}>
                <Text style={[s.accPill, a.id === sel && { color: C.ink }]}>{a.name.toUpperCase()}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { buzz(); setHistOpen(true); }} hitSlop={10}>
              <Text style={{ color: C.ink3, fontSize: 15 }}>◷</Text>
            </Pressable>
          </View>
        </View>

        {/* ----------------------------------------------------------- balance */}
        <View style={{ marginTop: short ? 16 : 26, alignItems: 'center' }}>
          <Micro dim style={{ fontSize: 9, letterSpacing: 2.5, marginBottom: 10 }}>BALANCE</Micro>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'], lineHeight: balSize + 4 }}>
            <Text style={{ color: C.ink3, fontSize: 18, fontWeight: '600' }}>{data.cur}</Text>
            <Text style={{ color: flashC || C.ink, fontSize: balSize, fontWeight: '700', letterSpacing: -1.5 }}>
              {shownCash < 0 ? '−' : ''}{balInt}
            </Text>
          </Text>
        </View>

        {/* reveal pill (long-pressed chip name) */}
        {reveal && (
          <View style={s.reveal} pointerEvents="none">
            <Text style={s.revealText}>{reveal}</Text>
          </View>
        )}

        {/* spacer pins the entry stack to the thumb zone */}
        <View style={{ flex: 1 }} />

        {/* ------------------------------------------------------------ amount */}
        <View style={s.amtRow}>
          <Text style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
            <Text style={{ color: C.ink3, fontSize: 21, fontWeight: '600' }}>{data.cur}</Text>
            <Text style={{ color: hasAmt ? C.ink : C.ink4, fontSize: amtSize, fontWeight: '700', letterSpacing: -1 }}>{fmt(amt)}</Text>
          </Text>
          {hasAmt && (
            <Pressable onPress={doInvest} style={({ pressed }) => [s.investChip, pressed && { backgroundColor: C.inv, transform: [{ scale: 0.94 }] }]}>
              {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.inv, fontSize: 19 }}>↗</Text>}
            </Pressable>
          )}
        </View>

        {/* --------------------------------------------- quick chips (amt == 0) */}
        {!hasAmt && quick.length > 0 && (
          <View style={s.quickRow}>
            {quick.map((v) => (
              <Pressable key={v} onPress={() => { buzz(); setAmt(v); }} style={({ pressed }) => [s.quick, pressed && { backgroundColor: C.fillHi, transform: [{ scale: 0.94 }] }]}>
                <Text style={s.quickText}>{fmt0(v)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* --------------------------------------------- emoji chips (amt > 0) */}
        {hasAmt && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingHorizontal: 2, paddingVertical: 3 }}>
              {catsFor('spent').map((c) => chip(c, 'spent'))}
              <View style={{ width: 1, height: 22, backgroundColor: C.line2 }} />
              {catsFor('got').map((c) => chip(c, 'got'))}
            </ScrollView>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="note"
              placeholderTextColor={C.ink4}
              style={s.note}
            />
          </View>
        )}

        {/* ------------------------------------------------------------ keypad */}
        <View style={{ marginTop: 6 }}>
          <KeyPad keyH={keyH} onKey={(k) => setAmt((a) => padAdvance(a, k))} />
        </View>

        {/* -------------------------------------------------------- action row */}
        <View style={[s.actions, { opacity: hasAmt ? 1 : 0.35 }]}>
          <Pressable onPress={() => saveEntry('spent')} style={({ pressed }) => [s.act, { height: actH, backgroundColor: pressed ? C.neg : C.negSoft }, pressed && { transform: [{ scale: 0.97 }] }]}>
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

      {/* ------------------------------------------------------- recent sheet */}
      <Sheet visible={histOpen} onClose={() => setHistOpen(false)} title="◷  Recent" sub={data.entries.length + ' entries'}>
        {!recent.length && (
          <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>No entries yet — type an amount, tap − or ＋.</Text>
        )}
        {recent.map((r) =>
          r.day ? (
            <Micro key={r.key} style={{ marginTop: 16, marginBottom: 2, fontSize: 10, letterSpacing: 1.8 }}>{r.day}</Micro>
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
                {r.e.type === 'transfer'
                  ? accName(r.e.from) + ' → ' + accName(r.e.to)
                  : (r.e.note ? r.e.note + ' · ' : '') + timeLabel(r.e.t)}
              </Text>
              <Text style={{
                fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'],
                color: r.e.type === 'got' ? C.pos : r.e.type === 'invest' ? C.inv : r.e.type === 'transfer' ? C.ink3 : C.ink,
              }}>
                {(r.e.type === 'spent' ? '−' : r.e.type === 'got' ? '+' : r.e.type === 'invest' ? '↗' : '') + fmt(r.e.amt)}
              </Text>
            </Pressable>
          )
        )}
        <Text style={{ color: C.ink4, fontSize: 11, textAlign: 'center', marginTop: 12 }}>tap to edit · hold to delete</Text>
      </Sheet>

      {/* ------------------------------------------------------ transfer sheet */}
      <AmountSheet
        visible={trOpen}
        title="⇆  Transfer"
        cur={data.cur}
        initial={amt}
        onClose={() => setTrOpen(false)}
        actions={[]}
      >
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
                    update((d) => { d.entries.push({ id: uid(), t: Date.now(), type: 'transfer', from: sel, to: a.id, amt: sheetAmt }); },
                      '⇆ ' + fmt(sheetAmt) + ' → ' + a.name, true);
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

      {/* ---------------------------------------------------------- edit sheet */}
      <AmountSheet
        visible={!!edit}
        title="Edit"
        cur={data.cur}
        initial={edit ? edit.amt : 0}
        onClose={() => setEdit(null)}
        actions={[
          {
            label: '⌫', color: C.neg, bg: C.negSoft, flex: 1,
            onPress: () => { const i = edit.idx; setEdit(null); update((d) => { d.entries.splice(i, 1); }, 'Deleted', true); },
          },
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
                <Pressable
                  key={c}
                  onPress={() => { buzz(); setEdit({ ...edit, cat: c }); }}
                  style={({ pressed }) => [s.editChip, on && { backgroundColor: C.fillSel, borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                >
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
  dest: { flex: 1, height: 48, borderRadius: 14, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accPill: { color: C.ink4, fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingVertical: 6 },

  reveal: { position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center', zIndex: 60 },
  revealText: {
    backgroundColor: C.toast, color: C.ink, fontSize: 12, fontWeight: '600',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },

  amtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 24, minHeight: 56 },
  investChip: {
    width: 40, height: 40, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(191,90,242,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  quick: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.fill, minWidth: 34, alignItems: 'center' },
  quickText: { color: C.ink2, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },

  chip: { width: 44, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1.5, borderColor: 'transparent' },
  chipBar: { width: 20, height: 2, borderRadius: 1, backgroundColor: C.line2, overflow: 'hidden' },

  note: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', color: C.ink, fontSize: 14, textAlign: 'center', paddingVertical: 9, marginTop: 6 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  act: { flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actGlyph: { fontSize: 32, fontWeight: '700' },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  editChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
});
