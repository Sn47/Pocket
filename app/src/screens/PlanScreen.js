import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { adv, allCats, emojiFor, fmt, fmt0, fmtDate, monthOf, nextMs, uid } from '../util';
import { AmountSheet, EmojiPicker, Field, Micro, Sheet } from '../ui';
import { analyze, suggestRec } from '../logic';

export default function PlanScreen() {
  const { data, acc, update, catsFor } = useStore();

  const [limitSheet, setLimitSheet] = useState(null); // { cat, emoji }
  const [recSheet, setRecSheet] = useState(null); // recurring id
  const [newRec, setNewRec] = useState(null); // { name } — v3: simple monthly spend
  const [newBud, setNewBud] = useState(null); // { cat } or { mode:'new', emoji, name }

  const ym = monthOf(Date.now());
  const byCat = useMemo(() => {
    const m = {};
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === ym) m[e.cat] = (m[e.cat] || 0) + e.amt;
    return m;
  }, [data.entries]);

  const todayS = fmtDate(new Date());
  const dues = data.recurring.filter((r) => r.next <= todayS && r.amt > 0);
  const recs = [...data.recurring].sort((a, b) => (a.next < b.next ? -1 : 1));
  const recObj = recSheet ? data.recurring.find((r) => r.id === recSheet) : null;

  // v3: one row per category (except Other) — unbudgeted rows show spend only
  const cats = allCats(data).filter(([, n]) => n !== 'Other');
  let totLim = 0, totSp = 0;
  for (const [, n] of cats) { totLim += data.budgets[n] || 0; totSp += byCat[n] || 0; }
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

  const snooze = (r) => update((d) => {
    const x = d.recurring.find((y) => y.id === r.id);
    if (x) x.next = fmtDate(new Date(Date.now() + 864e5));
  }, '⏰ tomorrow', true);

  const A = useMemo(() => analyze(data), [data]);
  const suggest = useMemo(() => suggestRec(data, A), [data]);
  const now = new Date();
  const domNow = now.getDate();
  const dimNow = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const trendFor = (c) => {
    const sp = byCat[c] || 0;
    const pace = domNow >= 3 ? (sp / domNow) * dimNow : sp;
    const pv = A.prevByCat[c] || 0;
    if (pv === 0 && pace === 0) return ['', C.pos];
    if (pace > pv * 1.15) return ['↑', C.neg];
    if (pace < pv * 0.85) return ['↓', C.pos];
    return ['', C.pos];
  };

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Micro>PLAN</Micro>

      {/* due rows: ✓ log · ✕ skip · hold ✕ snooze */}
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
          <Pressable
            onPress={() => { buzz(); skipOnce(r); }}
            onLongPress={() => { buzz(); snooze(r); }}
            delayLongPress={450}
            style={({ pressed }) => [s.dueBtn, { backgroundColor: C.fill }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: C.ink3, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      ))}

      {/* auto-detected recurring suggestion */}
      {suggest && data.suggestOn !== false && (
        <View style={s.due}>
          <Text style={{ fontSize: 16, width: 28, textAlign: 'center', color: C.ink3 }}>🔁</Text>
          <Text style={{ flex: 1, color: C.ink2, fontSize: 13, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            make “{suggest.note}” monthly?  {(suggest.type === 'spent' ? '−' : '+') + fmt0(suggest.amt)}
          </Text>
          <Pressable
            onPress={() => {
              buzz();
              const e = suggest;
              update((d) => {
                const dt2 = new Date(e.t);
                let nx = new Date(now.getFullYear(), now.getMonth(), dt2.getDate());
                if (nx.getTime() <= Date.now()) nx = new Date(now.getFullYear(), now.getMonth() + 1, dt2.getDate());
                d.recurring.push({ id: uid(), note: e.note.charAt(0).toUpperCase() + e.note.slice(1), type: e.type, cat: e.cat, amt: e.amt, freq: 'monthly', next: fmtDate(nx), auto: false, acc: e.acc || d.accounts[0].id });
              }, '🔁 ' + e.note + ' monthly', true);
            }}
            style={({ pressed }) => [s.dueBtn, { backgroundColor: pressed ? C.pos : C.posSoft }]}
          >
            {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.pos, fontSize: 16, fontWeight: '700' }}>✓</Text>}
          </Pressable>
          <Pressable
            onPress={() => { buzz(); const nm = suggest.note.toLowerCase(); update((d) => { d.dismissedRec.push(nm); }); }}
            style={({ pressed }) => [s.dueBtn, { backgroundColor: C.fill }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: C.ink3, fontSize: 15 }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* budgets */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>
        {'BUDGETS · ' + now.toLocaleDateString(undefined, { month: 'long' }).toUpperCase()}
      </Micro>
      {cats.map(([em, c]) => {
        const sp = byCat[c] || 0;
        const lim = data.budgets[c] || 0;
        const over = lim > 0 && sp > lim;
        const [trend, trendC] = trendFor(c);
        return (
          <Pressable
            key={c}
            onPress={() => { buzz(); setLimitSheet({ cat: c, emoji: em }); }}
            onLongPress={lim > 0 ? () => update((d) => { delete d.budgets[c]; }, em + ' limit removed', true) : undefined}
            delayLongPress={450}
            style={({ pressed }) => [s.bRow, pressed && { opacity: 0.55 }]}
          >
            <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: C.ink2 }}>{em}</Text>
            <View style={s.bTrack}>
              <View style={{ width: lim ? Math.min(100, (sp / lim) * 100) + '%' : '0%', height: 3, borderRadius: 2, backgroundColor: over ? C.neg : C.pos }} />
            </View>
            {!!trend && <Text style={{ fontSize: 11, fontWeight: '700', color: trendC }}>{trend}</Text>}
            <Text style={s.bNums}>{fmt0(sp) + (lim ? ' / ' + fmt0(lim) : '')}</Text>
            {over && <Text style={{ fontSize: 13 }}>🔥</Text>}
          </Pressable>
        );
      })}
      <View style={s.leftRow}>
        <Micro style={{ letterSpacing: 1.5 }}>LEFT THIS MONTH</Micro>
        <Text style={{ color: left < 0 ? C.neg : C.pos, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {(left < 0 ? '−' : '') + fmt0(left)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { buzz(); setNewBud({ cat: null }); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
          <Text style={s.ghostText}>＋ budget</Text>
        </Pressable>
        <Text style={s.hint}>tap to edit · hold to remove</Text>
      </View>

      {/* recurring */}
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
      <Pressable onPress={() => { buzz(); setNewRec({ name: '' }); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.ghostText}>＋ recurring</Text>
          <Text style={s.hint}>tap for actions · hold to delete</Text>
        </View>
      </Pressable>

      {/* budget limit sheet — ⌫ remove / set */}
      <AmountSheet
        visible={!!limitSheet}
        title={limitSheet ? limitSheet.emoji + '  ' + limitSheet.cat : ''}
        sub="monthly limit"
        cur={data.cur}
        initial={limitSheet ? data.budgets[limitSheet.cat] || 0 : 0}
        onClose={() => setLimitSheet(null)}
        actions={[
          {
            label: '⌫ remove', color: C.neg, bg: C.negSoft, flex: 1,
            onPress: () => {
              const c = limitSheet.cat;
              setLimitSheet(null);
              update((d) => { delete d.budgets[c]; }, 'limit removed', true);
            },
          },
          {
            label: 'set', color: '#000', bg: C.ink, flex: 2,
            onPress: (v) => {
              const c = limitSheet.cat;
              setLimitSheet(null);
              update((d) => { if (v > 0) d.budgets[c] = v; else delete d.budgets[c]; }, v > 0 ? '✓ limit set' : 'limit removed', true);
            },
          },
        ]}
      />

      {/* ＋ budget / ＋ new category sheet */}
      <AmountSheet
        visible={!!newBud}
        title={newBud && newBud.mode === 'new' ? '＋  New category' : '＋  New budget'}
        sub={newBud && newBud.mode === 'new' ? 'name it, pick an emoji, set a limit (optional)' : newBud && newBud.cat ? 'monthly limit for ' + newBud.cat : 'pick a category'}
        cur={data.cur}
        onClose={() => setNewBud(null)}
        actions={[{
          label: newBud && newBud.mode === 'new' ? 'create' : 'set limit',
          color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            const nb = newBud;
            if (!nb) return;
            if (nb.mode === 'new') {
              const nm0 = (nb.name || '').trim();
              if (!nm0) return;
              const NM = nm0.charAt(0).toUpperCase() + nm0.slice(1);
              const em = nb.emoji || '✱';
              setNewBud(null);
              update((d) => {
                if (!d.cats.some((x) => x[1].toLowerCase() === NM.toLowerCase())) d.cats.push([em, NM]);
                if (v > 0) d.budgets[NM] = v;
              }, '✓ ' + em + ' ' + NM, true);
              return;
            }
            if (v <= 0 || !nb.cat) return;
            setNewBud(null);
            update((d) => { d.budgets[nb.cat] = v; }, '✓ ' + nb.cat + ' limit set', true);
          },
        }]}
      >
        {newBud && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingVertical: 3, paddingHorizontal: 2 }}>
              {cats.map(([em, c]) => (
                <Pressable
                  key={c}
                  onPress={() => { buzz(); setNewBud({ cat: c }); }}
                  style={({ pressed }) => [s.eChip, !newBud.mode && newBud.cat === c && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                >
                  <Text style={{ fontSize: 20, opacity: data.budgets[c] ? 0.45 : 1 }}>{em}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => { buzz(); setNewBud({ mode: 'new', emoji: '', name: '' }); }}
                style={({ pressed }) => [s.eChip, newBud.mode === 'new' && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
              >
                <Text style={{ fontSize: 18, color: C.ink4, fontWeight: '700' }}>＋</Text>
              </Pressable>
            </ScrollView>
            {newBud.mode === 'new' && (
              <View>
                <EmojiPicker selected={newBud.emoji} onPick={(em) => setNewBud({ ...newBud, emoji: em })} />
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, width: 36, textAlign: 'center', paddingBottom: 8, color: C.ink4 }}>{newBud.emoji || '✱'}</Text>
                  <Field placeholder="new category name" value={newBud.name} onChangeText={(v) => setNewBud({ ...newBud, name: v })} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </View>
        )}
      </AmountSheet>

      {/* recurring row sheet: ✓ log now / skip once / ⌫ */}
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

      {/* ＋ recurring: v3 simple — name + amount, monthly spend from next month */}
      <AmountSheet
        visible={!!newRec}
        title="🔁  New recurring"
        sub="monthly spend — starts next month"
        cur={data.cur}
        onClose={() => setNewRec(null)}
        actions={[{
          label: 'create', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            const nm = (newRec.name || '').trim();
            if (v <= 0 || !nm) return;
            setNewRec(null);
            const nx = new Date();
            nx.setMonth(nx.getMonth() + 1);
            update((d) => {
              d.recurring.push({ id: uid(), note: nm.charAt(0).toUpperCase() + nm.slice(1), type: 'spent', cat: 'Bills', amt: v, freq: 'monthly', next: fmtDate(nx), auto: false, acc });
            }, '🔁 ' + nm, true);
          },
        }]}
      >
        {newRec && <Field placeholder="name" value={newRec.name} onChangeText={(v) => setNewRec({ ...newRec, name: v })} />}
      </AmountSheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginTop: 6 },
  dueBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  bTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  bNums: { color: C.ink2, fontSize: 12.5, fontVariant: ['tabular-nums'], minWidth: 76, textAlign: 'right' },
  leftRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  shBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ghost: { paddingVertical: 12, flex: 1 },
  ghostText: { color: C.ink3, fontSize: 13, fontWeight: '600' },
  hint: { color: C.ink4, fontSize: 10.5 },
  eChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.04)' },
});
