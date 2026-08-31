import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { adv, emojiFor, fmt, fmt0, fmtDate, monthOf, nextMs, uid, validDate } from '../util';
import { AmountSheet, EmojiPicker, Field, Micro, Sheet, KeyPad, padAdvance } from '../ui';
import { analyze, suggestRec } from '../logic';

export default function PlanScreen() {
  const { data, update, money, catsFor } = useStore();

  const [limitSheet, setLimitSheet] = useState(null); // { cat, emoji }
  const [newBudget, setNewBudget] = useState(null); // { cat } — pick category + limit
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

  // only budgeted categories are listed — removing a limit removes the row
  const ordered = [...catsFor('spent'), ...Object.keys(data.budgets)];
  const cats = [...new Set(ordered)].filter((c) => c !== 'Other' && data.budgets[c] > 0);
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

  const snooze = (r) => update((d) => {
    const x = d.recurring.find((y) => y.id === r.id);
    if (x) x.next = fmtDate(new Date(Date.now() + 864e5));
  }, '⏰ tomorrow', true);

  // v2.1: auto-detected recurring suggestion + budget pace trends
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

      {/* --------------------------------------- auto-detected recurring */}
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

      {/* ---------------------------------------------------------- budgets */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>
        {'BUDGETS · ' + new Date().toLocaleDateString(undefined, { month: 'long' }).toUpperCase()}
      </Micro>
      {!cats.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 14 }}>No budgets. ＋ budget to start one.</Text>}
      {cats.map((c) => {
        const sp = byCat[c] || 0;
        const lim = data.budgets[c] || 0;
        const over = lim > 0 && sp > lim;
        const [trend, trendC] = trendFor(c);
        return (
          <Pressable
            key={c}
            onPress={() => { buzz(); setLimitSheet({ cat: c, emoji: emojiFor(c) }); }}
            onLongPress={lim > 0 ? () => update((d) => { delete d.budgets[c]; }, emojiFor(c) + ' limit removed', true) : undefined}
            delayLongPress={450}
            style={({ pressed }) => [s.bRow, pressed && { opacity: 0.55 }]}
          >
            <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: C.ink2 }}>{emojiFor(c)}</Text>
            <View style={s.bTrack}>
              <View style={{ width: lim ? Math.min(100, (sp / lim) * 100) + '%' : '0%', height: 3, borderRadius: 2, backgroundColor: over ? C.neg : C.pos }} />
            </View>
            {!!trend && <Text style={{ fontSize: 11, fontWeight: '700', color: trendC }}>{trend}</Text>}
            <Text style={s.bNums}>{fmt0(sp) + (lim ? ' / ' + fmt0(lim) : '')}</Text>
            {over && <Text style={{ fontSize: 13 }}>🔥</Text>}
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { buzz(); setNewBudget({ cat: '' }); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
          <Text style={s.ghostText}>＋ budget</Text>
        </Pressable>
        <Text style={s.hint}>tap to edit · hold to remove</Text>
      </View>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.ghostText}>＋ recurring</Text>
          <Text style={s.hint}>tap for actions · hold to delete</Text>
        </View>
      </Pressable>

      {/* ------------------------------------------------- budget limit sheet */}
      <AmountSheet
        visible={!!limitSheet}
        title={limitSheet ? limitSheet.emoji + '  ' + limitSheet.cat : ''}
        sub="monthly limit"
        cur={data.cur}
        initial={limitSheet ? data.budgets[limitSheet.cat] || 0 : 0}
        onClose={() => setLimitSheet(null)}
        actions={[
          ...(limitSheet && data.budgets[limitSheet.cat]
            ? [{
                label: '⌫', color: C.neg, bg: C.negSoft, flex: 1,
                onPress: () => {
                  const c = limitSheet.cat;
                  setLimitSheet(null);
                  update((d) => { delete d.budgets[c]; }, emojiFor(c) + ' limit removed', true);
                },
              }]
            : []),
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
            let cat = newRec.cat;
            let newCatName = null, newCatEmoji = null;
            if (newRec.addingCat) {
              newCatName = (newRec.catName || '').trim();
              newCatEmoji = (newRec.catEmoji || '').trim();
              if (!newCatName) return;
              cat = newCatName;
            }
            const o = { id: uid(), type: newRec.type, cat, amt: v, note: nm, freq: newRec.freq, next: newRec.next, auto: newRec.auto, acc: data.accounts[0].id };
            const tp = newRec.type;
            setNewRec(null);
            update((d) => {
              if (newCatName && !d.cats[tp].includes(newCatName)) {
                d.cats[tp] = d.cats[tp].concat(newCatName);
                if (newCatEmoji) d.catEmoji[newCatName] = newCatEmoji;
              }
              d.recurring.push(o);
            }, '✓ ' + nm, true);
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
                  const on = !newRec.addingCat && newRec.cat === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => { buzz(); setNewRec({ ...newRec, cat: c, addingCat: false }); }}
                      style={({ pressed }) => [s.tChip, on && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                    >
                      <Text style={{ fontSize: e2 === '✱' ? 15 : 20, color: C.ink2, fontWeight: '700' }}>{e2}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => { buzz(); setNewRec({ ...newRec, addingCat: true, catEmoji: '', catName: '' }); }}
                  style={({ pressed }) => [s.tChip, newRec.addingCat && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                >
                  <Text style={{ fontSize: 18, color: C.ink4, fontWeight: '700' }}>＋</Text>
                </Pressable>
              </ScrollView>
            </View>
            {newRec.addingCat && (
              <View>
                <EmojiPicker selected={newRec.catEmoji} onPick={(em) => setNewRec({ ...newRec, catEmoji: em })} />
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, width: 36, textAlign: 'center', paddingBottom: 8, color: C.ink4 }}>{newRec.catEmoji || '✱'}</Text>
                  <Field placeholder="new category name" value={newRec.catName} onChangeText={(v) => setNewRec({ ...newRec, catName: v })} style={{ flex: 1 }} />
                </View>
              </View>
            )}
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

      {/* ---------------------------------------------------- ＋ budget sheet */}
      <AmountSheet
        visible={!!newBudget}
        title="＋  New budget"
        sub="pick a category, type the limit"
        cur={data.cur}
        onClose={() => setNewBudget(null)}
        actions={[{
          label: 'set', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            if (v <= 0) return;
            const nb = newBudget;
            if (nb.adding) {
              const nm = (nb.name || '').trim();
              const em = (nb.emoji || '').trim();
              if (!nm || catsFor('spent').includes(nm)) return;
              setNewBudget(null);
              update((d) => {
                d.cats.spent = d.cats.spent.concat(nm);
                if (em) d.catEmoji[nm] = em;
                d.budgets[nm] = v;
              }, '✓ ' + (em || '✱') + ' ' + nm + ' limit set', true);
              return;
            }
            if (!nb.cat) return;
            setNewBudget(null);
            update((d) => { d.budgets[nb.cat] = v; }, '✓ ' + emojiFor(nb.cat) + ' limit set', true);
          },
        }]}
      >
        {newBudget && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingVertical: 3, paddingHorizontal: 2 }}>
              {catsFor('spent').filter((c) => c !== 'Other').map((c) => {
                const e2 = emojiFor(c);
                const on = !newBudget.adding && newBudget.cat === c;
                const has = !!data.budgets[c];
                return (
                  <Pressable
                    key={c}
                    onPress={() => { buzz(); setNewBudget({ cat: c }); }}
                    style={({ pressed }) => [s.eChip, on && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
                  >
                    <Text style={{ fontSize: e2 === '✱' ? 15 : 20, color: C.ink2, fontWeight: '700', opacity: has ? 0.45 : 1 }}>{e2}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => { buzz(); setNewBudget({ adding: true, emoji: '', name: '' }); }}
                style={({ pressed }) => [s.eChip, newBudget.adding && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.9 }] }]}
              >
                <Text style={{ fontSize: 18, color: C.ink4, fontWeight: '700' }}>＋</Text>
              </Pressable>
            </ScrollView>
            {newBudget.adding && (
              <View>
                <EmojiPicker selected={newBudget.emoji} onPick={(em) => setNewBudget({ ...newBudget, emoji: em })} />
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, width: 36, textAlign: 'center', paddingBottom: 8, color: C.ink4 }}>{newBudget.emoji || '✱'}</Text>
                  <Field placeholder="new category name" value={newBudget.name} onChangeText={(v) => setNewBudget({ ...newBudget, name: v })} style={{ flex: 1 }} />
                </View>
              </View>
            )}
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
  bNums: { color: C.ink2, fontSize: 12.5, fontVariant: ['tabular-nums'], minWidth: 76, textAlign: 'right' },
  eChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  leftRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  shBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ghost: { paddingVertical: 12 },
  ghostText: { color: C.ink3, fontSize: 13, fontWeight: '600' },
  hint: { color: C.ink4, fontSize: 10.5 },
  tChip: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  fChip: { flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
});
