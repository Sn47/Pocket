import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, GRAYS } from '../theme';
import { buzz, useStore } from '../store';
import { fmt, fmt0, uid } from '../util';
import { AmountSheet, Field, Micro } from '../ui';

export default function GrowScreen() {
  const { data, sel, update, totals } = useStore();

  const [goalSheet, setGoalSheet] = useState(null); // goal id
  const [debtSheet, setDebtSheet] = useState(null); // debt id
  const [holdSheet, setHoldSheet] = useState(null); // holding id
  const [newKind, setNewKind] = useState(null); // 'newGoal' | 'newDebt'
  const [newName, setNewName] = useState('');

  const goal = goalSheet ? data.goals.find((g) => g.id === goalSheet) : null;
  const debt = debtSheet ? data.debts.find((d) => d.id === debtSheet) : null;
  const hold = holdSheet ? data.holdings.find((h) => h.id === holdSheet) : null;

  // portfolio aggregates
  const invV = data.holdings.reduce((a, h) => a + h.value, 0);
  const invIn = data.holdings.reduce((a, h) => a + h.invested, 0);
  const invGainAbs = invV - invIn;
  const holdsSorted = [...data.holdings].sort((a, b) => b.value - a.value);
  const firstInv = data.entries.find((e) => e.type === 'invest');
  const invMonths = firstInv ? Math.max(1, (Date.now() - firstInv.t) / (30 * 864e5)) : 1;

  const eta = (x) => {
    if (!x.min || x.min <= 0) return '';
    let r = x.remaining, m = 0;
    while (r > 0 && m < 600) { r = r + (x.rate / 1200) * r - x.min; m++; }
    return m < 600 ? '~' + m + ' mo' : '';
  };

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Micro>GROW</Micro>

      {/* ------------------------------------------------------------ goals */}
      <Micro style={{ marginTop: 20, letterSpacing: 1.8 }}>◎ GOALS</Micro>
      {!data.goals.length && <Text style={s.empty}>No goals. ＋ goal to start one.</Text>}
      {data.goals.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => { buzz(); setGoalSheet(g.id); }}
          onLongPress={() => update((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); }, 'Deleted', true)}
          delayLongPress={450}
          style={({ pressed }) => [s.growRow, pressed && { opacity: 0.55 }]}
        >
          <View style={s.rowTop}>
            <Text style={{ flex: 1, color: C.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{g.name}</Text>
            <Text style={{ color: C.ink2, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{fmt0(g.saved) + ' / ' + fmt0(g.target)}</Text>
            <Text style={{ fontSize: 13, color: C.pos, width: 16, textAlign: 'center' }}>{g.saved >= g.target ? '✓' : ''}</Text>
          </View>
          <View style={s.track}>
            <View style={{ width: Math.min(100, (g.saved / g.target) * 100) + '%', height: 3, backgroundColor: C.pos, borderRadius: 2 }} />
          </View>
        </Pressable>
      ))}
      <Pressable onPress={() => { buzz(); setNewName(''); setNewKind('newGoal'); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
        <Text style={s.ghostText}>＋ goal</Text>
      </Pressable>

      {/* ------------------------------------------------------------- debt */}
      <Micro style={{ marginTop: 22, letterSpacing: 1.8 }}>DEBT</Micro>
      {!data.debts.length && <Text style={s.empty}>Debt-free.</Text>}
      {data.debts.map((x) => (
        <Pressable
          key={x.id}
          onPress={() => { buzz(); setDebtSheet(x.id); }}
          onLongPress={() => update((d) => { d.debts = d.debts.filter((y) => y.id !== x.id); }, 'Deleted', true)}
          delayLongPress={450}
          style={({ pressed }) => [s.growRow, pressed && { opacity: 0.55 }]}
        >
          <View style={s.rowTop}>
            <Text style={{ flex: 1, color: C.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{x.name}</Text>
            <Text style={{ color: C.ink3, fontSize: 11, fontVariant: ['tabular-nums'] }}>{eta(x)}</Text>
            <Text style={{ color: C.neg, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmt0(x.remaining) + ' left'}</Text>
          </View>
          <View style={s.track}>
            <View style={{ width: Math.min(100, ((x.total - x.remaining) / x.total) * 100) + '%', height: 3, backgroundColor: C.neg, borderRadius: 2 }} />
          </View>
        </Pressable>
      ))}
      <Pressable onPress={() => { buzz(); setNewName(''); setNewKind('newDebt'); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
        <Text style={s.ghostText}>＋ debt</Text>
      </Pressable>

      {/* --------------------------------------------------------- invested */}
      <Micro style={{ marginTop: 22, letterSpacing: 1.8 }}>↗ INVESTED</Micro>
      {!data.holdings.length && <Text style={s.empty}>Nothing invested yet.</Text>}
      {data.holdings.length > 0 && (
        <View>
          {/* portfolio header: value · gain · put in · /mo pace · allocation bar */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <Text style={{ color: C.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{fmt0(invV)}</Text>
            <Text style={{ color: invGainAbs >= 0 ? C.pos : C.neg, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {(invGainAbs >= 0 ? '+' : '−') + fmt0(invGainAbs) + ' · ' + (invIn > 0 ? ((invGainAbs / invIn) * 100).toFixed(1) : '0.0') + '%'}
            </Text>
          </View>
          <Text style={{ color: C.ink3, fontSize: 11, marginTop: 3, fontVariant: ['tabular-nums'] }}>
            put in {fmt0(invIn)} · {fmt0(invIn / invMonths)}/mo pace
          </Text>
          <View style={{ flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', gap: 2, marginTop: 12 }}>
            {holdsSorted.map((h, i) => (
              <View key={h.id} style={{ width: (invV > 0 ? Math.max(2, (h.value / invV) * 100) : 0) + '%', backgroundColor: GRAYS[Math.min(i, 6)], height: 4 }} />
            ))}
          </View>
        </View>
      )}
      {holdsSorted.map((h, i) => {
        const g = h.value - h.invested;
        const pc = h.invested > 0 ? (g / h.invested) * 100 : 0;
        return (
          <Pressable
            key={h.id}
            onPress={() => { buzz(); setHoldSheet(h.id); }}
            style={({ pressed }) => [s.hRow, pressed && { opacity: 0.55 }]}
          >
            <View style={{ width: 28, alignItems: 'center' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GRAYS[Math.min(i, 6)] }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{h.name}</Text>
              <Text style={{ color: C.ink3, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                {(invV > 0 ? Math.round((h.value / invV) * 100) + '%' : '—')} of portfolio · in {fmt0(h.invested)}
              </Text>
            </View>
            <Text style={{ color: C.ink, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmt0(h.value)}</Text>
            <Text style={{ color: pc >= 0 ? C.pos : C.neg, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 48, textAlign: 'right' }}>
              {(pc >= 0 ? '+' : '') + pc.toFixed(1) + '%'}
            </Text>
          </Pressable>
        );
      })}
      <Pressable onPress={() => { buzz(); setNewName(''); setNewKind('newHold'); }} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
        <Text style={s.ghostText}>＋ investment</Text>
      </Pressable>

      {/* -------------------------------------------------------- net worth */}
      <View style={s.netRow}>
        <Micro style={{ letterSpacing: 1.5 }}>NET WORTH</Micro>
        <Text style={{ color: C.ink, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmt0(totals.net)}</Text>
      </View>

      {/* ------------------------------------------------------ goal ± sheet */}
      <AmountSheet
        visible={!!goal}
        title={goal ? '◎  ' + goal.name : ''}
        sub={goal ? fmt0(goal.saved) + ' / ' + fmt0(goal.target) : ''}
        cur={data.cur}
        onClose={() => setGoalSheet(null)}
        actions={[
          {
            label: '−', color: C.ink2, bg: C.fill, flex: 1,
            onPress: (v) => {
              if (v <= 0) return;
              const id = goal.id; setGoalSheet(null);
              update((d) => { const x = d.goals.find((y) => y.id === id); if (x) x.saved = Math.max(0, x.saved - v); }, '−' + fmt(v) + ' from goal', true);
            },
          },
          {
            label: '＋ add', color: '#000', bg: C.pos, flex: 2,
            onPress: (v) => {
              if (v <= 0) return;
              const g0 = goal; setGoalSheet(null);
              update((d) => { const x = d.goals.find((y) => y.id === g0.id); if (x) x.saved += v; },
                g0.saved + v >= g0.target ? '✓ goal reached' : '＋' + fmt(v) + '  ◎', true);
            },
          },
        ]}
      />

      {/* ------------------------------------------------------ debt pay sheet */}
      <AmountSheet
        visible={!!debt}
        title={debt ? debt.name : ''}
        sub={debt ? fmt0(debt.remaining) + ' left · ' + debt.rate + '%' : ''}
        cur={data.cur}
        onClose={() => setDebtSheet(null)}
        actions={[{
          label: 'pay', color: '#000', bg: C.pos, flex: 1,
          onPress: (v) => {
            if (v <= 0) return;
            const id = debt.id; setDebtSheet(null);
            update((d) => { const x = d.debts.find((y) => y.id === id); if (x) x.remaining = Math.max(0, x.remaining - v); }, '✓ paid ' + fmt(v), true);
          },
        }]}
      />

      {/* --------------------------------- holding: ⌫ sell / ＋ add / set value */}
      <AmountSheet
        visible={!!hold}
        title={hold ? '↗  ' + hold.name : ''}
        sub={hold ? 'in ' + fmt0(hold.invested) + ' · now ' + fmt0(hold.value) : ''}
        cur={data.cur}
        onClose={() => setHoldSheet(null)}
        actions={[
          {
            label: '⌫ sell', color: C.neg, bg: C.negSoft, flex: 1,
            onPress: () => {
              const h0 = hold; setHoldSheet(null);
              update((d) => {
                const x = d.holdings.find((y) => y.id === h0.id);
                if (!x) return;
                d.entries.push({ id: uid(), t: Date.now(), type: 'got', cat: 'Other', amt: x.value, note: 'sold ' + x.name.toLowerCase(), acc: sel });
                d.holdings = d.holdings.filter((y) => y.id !== h0.id);
              }, '✓ sold · +' + fmt(h0.value || 0), true);
            },
          },
          {
            label: '＋ add', color: '#000', bg: C.inv, flex: 1,
            onPress: (v) => {
              if (v <= 0) return;
              const h0 = hold; setHoldSheet(null);
              update((d) => {
                const x = d.holdings.find((y) => y.id === h0.id);
                if (!x) return;
                d.entries.push({ id: uid(), t: Date.now(), type: 'invest', cat: x.name, amt: v, acc: sel });
                x.invested += v; x.value += v;
              }, '↗ +' + fmt(v) + '  ' + h0.name, true);
            },
          },
          {
            label: 'set value', color: C.ink2, bg: C.fill, flex: 1,
            onPress: (v) => {
              if (v <= 0) return;
              const id = hold.id; setHoldSheet(null);
              update((d) => { const x = d.holdings.find((y) => y.id === id); if (x) x.value = v; }, '✓ value updated', true);
            },
          },
        ]}
      />

      {/* ------------------------------- new goal / new debt / new investment */}
      <AmountSheet
        visible={!!newKind}
        title={newKind === 'newHold' ? '↗  New investment' : newKind === 'newGoal' ? '◎  New goal' : 'New debt'}
        sub={newKind === 'newHold' ? 'amount invested — leaves your cash' : newKind === 'newGoal' ? 'target amount' : 'amount owed'}
        cur={data.cur}
        onClose={() => setNewKind(null)}
        actions={[{
          label: 'create', color: '#000', bg: newKind === 'newHold' ? C.inv : C.ink, flex: 1,
          onPress: (v) => {
            const nm = newName.trim();
            if (v <= 0 || !nm) return;
            const kind = newKind; setNewKind(null);
            if (kind === 'newGoal') update((d) => { d.goals.push({ id: uid(), name: nm, target: v, saved: 0, created: Date.now() }); }, '✓ ' + nm, true);
            else if (kind === 'newDebt') update((d) => { d.debts.push({ id: uid(), name: nm, total: v, remaining: v, rate: 0, min: 0 }); }, '✓ ' + nm, true);
            else update((d) => {
              d.entries.push({ id: uid(), t: Date.now(), type: 'invest', cat: nm, amt: v, acc: sel });
              d.holdings.push({ id: uid(), name: nm, invested: v, value: v });
            }, '↗ ' + nm, true);
          },
        }]}
      >
        <Field placeholder="name" value={newName} onChangeText={setNewName} />
      </AmountSheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  growRow: { paddingVertical: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 9 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  empty: { color: C.ink4, fontSize: 13, paddingVertical: 14 },
  ghost: { paddingVertical: 12 },
  ghostText: { color: C.ink3, fontSize: 13, fontWeight: '600' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
});
