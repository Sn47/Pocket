import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { adv, emojiFor, fmt, fmt0, fmtDate, monthOf, nextMs, uid, validDate } from '../util';
import { AmountSheet, Field, Micro, Sheet } from '../ui';

export default function PlanScreen() {
  const { data, update, money, catsFor } = useStore();

  const [limitSheet, setLimitSheet] = useState(null); // { cat, emoji }
  const [recSheet, setRecSheet] = useState(null); // recurring id
  const [newRec, setNewRec] = useState(null); // { name, type, cat, freq, next, auto }

  const ym = monthOf(Date.now());
  const byCat = useMemo(() => {
    const m = {};
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === ym) m[e.cat] = (m[e.cat] || 0) + e.amt;
    return m;
  }, [data.entries]);

  const todayS = fmtDate(new Date());
  const dues = data.recurring.filter((r) => r.next <= todayS);
  const recs = [...data.recurring].sort((a, b) => (a.next < b.next ? -1 : 1));
  const recObj = recSheet ? data.recurring.find((r) => r.id === recSheet) : null;

  const cats = catsFor('spent').filter((c) => c !== 'Other');
  let totLim = 0, totSp = 0;
  for (const c of cats) { totLim += data.budgets[c] || 0; totSp += byCat[c] || 0; }
  const left = totLim - totSp;

  const recName = (r) => r.note || r.name || r.cat;

  const logNow = (r) => update((d) => {
    const x = d.recurring.find((y) => y.id === r.id);
    if (!x) return;
    d.entries.push({ id: uid(), t: Date.now(), type: x.type, cat: x.cat, amt: x.amt, note: recName(x).toLowerCase(), acc: x.acc });
    x.next = adv(x.next, x.freq);
  }, '✓ ' + recName(r) + ' logged', true);

  const skipOnce = (r) => update((d) => {
    const x = d.recurring.find((y) => y.id === r.id);
    if (x) x.next = adv(x.next, x.freq);
  }, 'Skipped', true);

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Micro>PLAN</Micro>

      {/* -------------------------------------------------------- due rows */}
      {dues.map((r) => (
        <View key={r.id} style={s.due}>
          <Text style={{ fontSize: 18 }}>⏰</Text>
          <Text style={{ flex: 1, color: C.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{recName(r)}</Text>
          <Text style={{ color: r.type === 'spent' ? C.neg : C.pos, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {(r.type === 'spent' ? '−' : '+') + fmt(r.amt)}
          </Text>
          <Pressable onPress={() => { buzz(); logNow(r); }} style={({ pressed }) => [s.dueBtn, { backgroundColor: pressed ? C.pos : C.posSoft }, pressed && { transform: [{ scale: 0.92 }] }]}>
            {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.pos, fontSize: 18, fontWeight: '700' }}>✓</Text>}
          </Pressable>
          <Pressable onPress={() => { buzz(); skipOnce(r); }} style={({ pressed }) => [s.dueBtn, { backgroundColor: C.fill }, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: C.ink3, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      ))}

      {/* ---------------------------------------------------------- budgets */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>
        {'BUDGETS · ' + new Date().toLocaleDateString(undefined, { month: 'long' }).toUpperCase()}
      </Micro>
      {cats.map((c) => {
        const sp = byCat[c] || 0;
        const lim = data.budgets[c] || 0;
        const over = lim > 0 && sp > lim;
        return (
          <Pressable key={c} onPress={() => { buzz(); setLimitSheet({ cat: c, emoji: emojiFor(c) }); }} style={({ pressed }) => [s.bRow, pressed && { opacity: 0.55 }]}>
            <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: C.ink2 }}>{emojiFor(c)}</Text>
            <View style={s.bTrack}>
              <View style={{ width: lim ? Math.min(100, (sp / lim) * 100) + '%' : '0%', height: 3, borderRadius: 2, backgroundColor: over ? C.neg : C.pos }} />
            </View>
            <Text style={s.bNums}>{fmt0(sp) + (lim ? ' / ' + fmt0(lim) : '')}</Text>
            <Text style={{ fontSize: 13, width: 18, textAlign: 'center' }}>{over ? '🔥' : ''}</Text>
          </Pressable>
        );
      })}
      <View style={s.leftRow}>
        <Micro style={{ letterSpacing: 1.5 }}>LEFT THIS MONTH</Micro>
        <Text style={{ color: left < 0 ? C.neg : C.pos, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {(left < 0 ? '−' : '') + fmt0(left)}
        </Text>
      </View>

      {/* -------------------------------------------------------- recurring */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>RECURRING</Micro>
      {!recs.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>Nothing scheduled.</Text>}
      {recs.map((r) => {
        const days = Math.max(0, Math.ceil((nextMs(r.next) - Date.now()) / 864e5));
        return (
          <Pressable
            key={r.id}
            onPress={() => { buzz(); setRecSheet(r.id); }}
            onLongPress={() => update((d) => { d.recurring = d.recurring.filter((x) => x.id !== r.id); }, 'Deleted', true)}
            delayLongPress={450}
            style={({ pressed }) => [s.rRow, pressed && { opacity: 0.55 }]}
          >
            <Text style={{ fontSize: 16, width: 28, textAlign: 'center', color: C.ink3 }}>🔁</Text>
            <Text style={{ flex: 1, color: C.ink, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
              {recName(r) + (r.auto ? ' · auto' : '')}
            </Text>
            <Text style={{ color: C.ink3, fontSize: 11, fontVariant: ['tabular-nums'] }}>{days === 0 ? 'today' : 'in ' + days + 'd'}</Text>
            <Text style={{ color: r.type === 'spent' ? C.ink2 : C.pos, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 86, textAlign: 'right' }}>
              {(r.type === 'spent' ? '−' : '+') + fmt(r.amt)}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => { buzz(); setNewRec({ name: '', type: 'spent', cat: 'Bills', freq: 'monthly', next: fmtDate(new Date()), auto: true }); }}
        style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}
      >
        <Text style={s.ghostText}>＋ recurring</Text>
      </Pressable>

      {/* ------------------------------------------------- budget limit sheet */}
      <AmountSheet
        visible={!!limitSheet}
        title={limitSheet ? limitSheet.emoji + '  ' + limitSheet.cat : ''}
        sub="monthly limit"
        cur={data.cur}
        initial={limitSheet ? data.budgets[limitSheet.cat] || 0 : 0}
        onClose={() => setLimitSheet(null)}
        actions={[{
          label: 'set', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            const c = limitSheet.cat;
            setLimitSheet(null);
            update((d) => { if (v > 0) d.budgets[c] = v; else delete d.budgets[c]; }, v > 0 ? '✓ limit set' : 'limit removed', true);
          },
        }]}
      />

      {/* ------------------------------------------------- new recurring sheet */}
      <AmountSheet
        visible={!!newRec}
        title="🔁  New recurring"
        sub="amount"
        cur={data.cur}
        onClose={() => setNewRec(null)}
        actions={[{
          label: 'create', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            if (!newRec) return;
            const nm = newRec.name.trim();
            if (v <= 0 || !nm || !validDate(newRec.next)) return;
            const o = { id: uid(), type: newRec.type, cat: newRec.cat, amt: v, note: nm, freq: newRec.freq, next: newRec.next, auto: newRec.auto, acc: data.accounts[0].id };
            setNewRec(null);
            update((d) => { d.recurring.push(o); }, '✓ ' + nm, true);
          },
        }]}
      >
        {newRec && (
          <View>
            <Field placeholder="name" value={newRec.name} onChangeText={(v) => setNewRec({ ...newRec, name: v })} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {[['spent', '−', C.neg], ['got', '＋', C.pos]].map(([tp, g, col]) => (
                <Pressable
                  key={tp}
                  onPress={() => { buzz(); setNewRec({ ...newRec, type: tp, cat: catsFor(tp)[0] }); }}
                  style={({ pressed }) => [s.tChip, newRec.type === tp && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: col }, pressed && { transform: [{ scale: 0.9 }] }]}
                >
                  <Text style={{ color: col, fontSize: 19, fontWeight: '700' }}>{g}</Text>
                </Pressable>
              ))}
              <View style={{ width: 1, height: 22, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                {catsFor(newRec.type).map((c) => {
                  const e2 = emojiFor(c);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => { buzz(); setNewRec({ ...newRec, cat: c }); }}
                      style={({ pressed }) => [s.tChip, newRec.cat === c && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                    >
                      <Text style={{ fontSize: e2 === '✱' ? 15 : 20, color: C.ink2, fontWeight: '700' }}>{e2}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {['daily', 'weekly', 'monthly', 'yearly'].map((f) => (
                <Pressable
                  key={f}
                  onPress={() => { buzz(); setNewRec({ ...newRec, freq: f }); }}
                  style={({ pressed }) => [s.fChip, newRec.freq === f && { backgroundColor: 'rgba(255,255,255,0.1)' }, pressed && { opacity: 0.6 }]}
                >
                  <Text style={{ color: newRec.freq === f ? C.ink : C.ink3, fontSize: 12, fontWeight: '600' }}>{f}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Field
                placeholder="next YYYY-MM-DD"
                value={newRec.next}
                onChangeText={(v) => setNewRec({ ...newRec, next: v })}
                style={{ flex: 1, fontVariant: ['tabular-nums'] }}
              />
              <Pressable onPress={() => { buzz(); setNewRec({ ...newRec, auto: !newRec.auto }); }} hitSlop={10} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                <Text style={{ color: C.ink3, fontSize: 11 }}>logs itself</Text>
                <Text style={{ color: newRec.auto ? C.pos : C.ink4, fontSize: 12, fontWeight: '700' }}>{newRec.auto ? 'on' : 'off'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </AmountSheet>

      {/* ------------------------------------------------ recurring row sheet */}
      <Sheet visible={!!recObj} onClose={() => setRecSheet(null)} title={recObj ? '🔁  ' + recName(recObj) : ''} sub={recObj ? recObj.freq : ''}>
        {recObj && (
          <View>
            <Text style={{ color: C.ink2, fontSize: 13, marginTop: 12, fontVariant: ['tabular-nums'] }}>
              {(recObj.type === 'spent' ? '−' : '+') + data.cur + fmt(recObj.amt) + ' · next ' + recObj.next + (recObj.auto ? ' · logs itself' : '')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => { buzz(); logNow(recObj); setRecSheet(null); }} style={({ pressed }) => [s.shBtn, { flex: 1, backgroundColor: pressed ? C.pos : C.posSoft }]}>
                {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.pos, fontSize: 15, fontWeight: '700' }}>✓ log now</Text>}
              </Pressable>
              <Pressable onPress={() => { buzz(); skipOnce(recObj); setRecSheet(null); }} style={({ pressed }) => [s.shBtn, { flex: 1, backgroundColor: C.fill }, pressed && { opacity: 0.6 }]}>
                <Text style={{ color: C.ink2, fontSize: 15, fontWeight: '600' }}>skip once</Text>
              </Pressable>
              <Pressable
                onPress={() => { buzz(); const id = recObj.id; setRecSheet(null); update((d) => { d.recurring = d.recurring.filter((x) => x.id !== id); }, 'Deleted', true); }}
                style={({ pressed }) => [s.shBtn, { width: 56, backgroundColor: pressed ? C.neg : C.negSoft }]}
              >
                {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.neg, fontSize: 17 }}>⌫</Text>}
              </Pressable>
            </View>
          </View>
        )}
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginTop: 6 },
  dueBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  bTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  bNums: { color: C.ink2, fontSize: 12.5, fontVariant: ['tabular-nums'], minWidth: 96, textAlign: 'right' },
  leftRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  shBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ghost: { paddingVertical: 12 },
  ghostText: { color: C.ink3, fontSize: 13, fontWeight: '600' },
  tChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  fChip: { flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
});
