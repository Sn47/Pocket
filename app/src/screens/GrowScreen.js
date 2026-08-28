import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { fmt, fmt0, uid } from '../util';
import { AmountSheet, Field, Micro } from '../ui';

export default function GrowScreen() {
  const { data, update, totals } = useStore();

  const [goalSheet, setGoalSheet] = useState(null); // goal id
  const [debtSheet, setDebtSheet] = useState(null); // debt id
  const [holdSheet, setHoldSheet] = useState(null); // holding id
  const [newKind, setNewKind] = useState(null); // 'newGoal' | 'newDebt'
  const [newName, setNewName] = useState('');

  const goal = goalSheet ? data.goals.find((g) => g.id === goalSheet) : null;
  const debt = debtSheet ? data.debts.find((d) => d.id === debtSheet) : null;
  const hold = holdSheet ? data.holdings.find((h) => h.id === holdSheet) : null;

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
      {!data.holdings.length && <Text style={s.empty}>Nothing invested yet — type an amount, tap ↗.</Text>}
      {data.holdings.map((h) => {
        const g = h.value - h.invested;
        const pc = h.invested > 0 ? (g / h.invested) * 100 : 0;
        return (
          <Pressable
            key={h.id}
            onPress={() => { buzz(); setHoldSheet(h.id); }}
            onLongPress={() => update((d) => { d.holdings = d.holdings.filter((x) => x.id !== h.id); }, 'Deleted', true)}
            delayLongPress={450}
            style={({ pressed }) => [s.hRow, pressed && { opacity: 0.55 }]}
          >
            <Text style={{ fontSize: 15, width: 28, textAlign: 'center', color: C.inv }}>↗</Text>
            <Text style={{ flex: 1, color: C.ink, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{h.name}</Text>
            <Text style={{ color: C.ink, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmt0(h.value)}</Text>
            <Text style={{ color: pc >= 0 ? C.pos : C.neg, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 48, textAlign: 'right' }}>
              {(pc >= 0 ? '+' : '') + pc.toFixed(1) + '%'}
            </Text>
          </Pressable>
        );
      })}

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

      {/* ------------------------------------------------- holding value sheet */}
      <AmountSheet
        visible={!!hold}
        title={hold ? '↗  ' + hold.name : ''}
        sub={hold ? 'invested ' + fmt0(hold.invested) : ''}
        cur={data.cur}
        initial={hold ? hold.value : 0}
        onClose={() => setHoldSheet(null)}
        actions={[{
          label: 'set value', color: '#000', bg: C.inv, flex: 1,
          onPress: (v) => {
            if (v <= 0) return;
            const id = hold.id; setHoldSheet(null);
            update((d) => { const x = d.holdings.find((y) => y.id === id); if (x) x.value = v; }, '✓ updated', true);
          },
        }]}
      />

      {/* ------------------------------------------------- new goal / new debt */}
      <AmountSheet
        visible={!!newKind}
        title={newKind === 'newGoal' ? '◎  New goal' : 'New debt'}
        sub={newKind === 'newGoal' ? 'target amount' : 'amount owed'}
        cur={data.cur}
        onClose={() => setNewKind(null)}
        actions={[{
          label: 'create', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => {
            const nm = newName.trim();
            if (v <= 0 || !nm) return;
            const kind = newKind; setNewKind(null);
            if (kind === 'newGoal') update((d) => { d.goals.push({ id: uid(), name: nm, target: v, saved: 0, created: Date.now() }); }, '✓ ' + nm, true);
            else update((d) => { d.debts.push({ id: uid(), name: nm, total: v, remaining: v, rate: 0, min: 0 }); }, '✓ ' + nm, true);
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
