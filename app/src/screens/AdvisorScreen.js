import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { buzz, useStore } from '../store';
import { emojiFor, fmt, fmt0, uid } from '../util';
import { AmountSheet, Field, Micro, Sheet } from '../ui';
import { Bars, PaceChart } from '../charts';
import { analyze, buildInsights, mindfulLine, paceData, scoreLever } from '../logic';

export default function AdvisorScreen() {
  const { data, acc, setTab, update, catsFor } = useStore();
  const now = new Date();

  const [scoreOpen, setScoreOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const [insOpen, setInsOpen] = useState(null); // insight id
  const [action, setAction] = useState(null); // { type, ... } → local amount sheets
  const [newName, setNewName] = useState('');

  const A = useMemo(() => analyze(data, now), [data]);
  const insights = useMemo(() => buildInsights(data, A, data.cur, catsFor('spent')), [data]);
  const curIns = insOpen ? insights.find((x) => x.id === insOpen) : null;

  const scoreC = A.score >= 70 ? C.pos : A.score >= 40 ? C.ink : C.neg;
  const kept = A.mGot > 0 ? Math.round(((A.mGot - A.mSpent) / A.mGot) * 100) : null;
  const topC = A.catList[0];
  let logs = 0;
  for (const e of data.entries) if (new Date(e.t).getFullYear() * 100 + new Date(e.t).getMonth() === A.ym && e.type !== 'transfer') logs++;
  const pace = A.domNow >= 3 ? (A.mSpent / A.domNow) * A.dimNow : A.mSpent;
  const vsPrev = A.prevSpent > 0 ? Math.round((pace / A.prevSpent - 1) * 100) : null;

  const pulse = [
    { glyph: '％', name: 'Kept of income', val: kept === null ? '—' : kept + '%', c: kept === null ? C.ink3 : kept >= 0 ? C.pos : C.neg, arrow: '›', onTap: () => setRateOpen(true) },
    { glyph: '−', name: 'Spent · pace vs last month', val: fmt0(A.mSpent) + (vsPrev === null ? '' : ' · ' + (vsPrev >= 0 ? '+' : '') + vsPrev + '%'), c: vsPrev !== null && vsPrev > 10 ? C.neg : C.ink, arrow: '›', onTap: () => setPaceOpen(true) },
    { glyph: topC ? emojiFor(topC) : '·', name: 'Biggest pull', val: topC ? topC + ' · ' + Math.round(((A.byCat[topC] || 0) / (A.mSpent || 1)) * 100) + '%' : '—', c: C.ink, arrow: '' },
    { glyph: '◷', name: 'Entries noticed', val: String(logs), c: C.ink2, arrow: '' },
  ];

  const rateBars = A.months.slice(-6).map((m) => {
    const r = m.got > 0 ? (m.got - m.spent) / m.got : null;
    return {
      label: m.label,
      pct: r === null ? '—' : Math.round(r * 100) + '%',
      h: r === null ? 3 : Math.max(3, Math.round(Math.min(1, Math.abs(r)) * 46)),
      c: r === null ? C.ink4 : r >= 0 ? C.pos : C.neg,
    };
  });

  const pd = useMemo(() => (paceOpen ? paceData(data, now) : null), [paceOpen, data.entries]);
  const paceNote = A.prevSpent > 0 && A.domNow >= 3 ? ((pace / A.prevSpent - 1) >= 0 ? '+' : '') + Math.round((pace / A.prevSpent - 1) * 100) + '% pace' : '';

  // one-tap pre-filled actions from insight sheets
  const runAction = (a) => {
    setInsOpen(null);
    if (!a) return;
    if (a.type === 'plan') { setTab('plan'); return; }
    if (a.type === 'invest') { setNewName(''); setAction(a); return; }
    setAction(a);
  };

  const actionSheetProps = (() => {
    if (!action) return null;
    if (action.type === 'debt') {
      const x0 = data.debts.find((x) => x.id === action.id) || {};
      return {
        title: x0.name || '', sub: fmt0(x0.remaining || 0) + ' left · ' + (x0.rate || 0) + '%',
        actions: [{
          label: 'pay', color: '#000', bg: C.pos, flex: 1,
          onPress: (v) => { if (v <= 0) return; const id = action.id; setAction(null); update((d) => { const x = d.debts.find((y) => y.id === id); if (x) x.remaining = Math.max(0, x.remaining - v); }, '✓ paid ' + fmt(v), true); },
        }],
      };
    }
    if (action.type === 'budget') {
      return {
        title: emojiFor(action.cat) + '  ' + action.cat, sub: 'monthly limit', initial: action.initial || 0,
        actions: [{
          label: 'set', color: '#000', bg: C.ink, flex: 1,
          onPress: (v) => { const c = action.cat; setAction(null); update((d) => { if (v > 0) d.budgets[c] = v; else delete d.budgets[c]; }, v > 0 ? '✓ limit set' : 'limit removed', true); },
        }],
      };
    }
    if (action.type === 'goal') {
      const g = data.goals.find((x) => x.id === action.id) || {};
      return {
        title: '◎  ' + (g.name || ''), sub: fmt0(g.saved || 0) + ' / ' + fmt0(g.target || 0), initial: action.initial || 0,
        actions: [{
          label: '＋ add', color: '#000', bg: C.pos, flex: 1,
          onPress: (v) => { if (v <= 0) return; const id = action.id; setAction(null); update((d) => { const x = d.goals.find((y) => y.id === id); if (x) x.saved += v; }, (g.saved + v >= g.target ? '✓ goal reached' : '＋' + fmt(v) + '  ◎'), true); },
        }],
      };
    }
    if (action.type === 'holding') {
      const h = data.holdings.find((x) => x.id === action.id) || {};
      return {
        title: '↗  ' + (h.name || ''), sub: 'in ' + fmt0(h.invested || 0) + ' · now ' + fmt0(h.value || 0), initial: action.initial || 0,
        actions: [{
          label: 'set value', color: '#000', bg: C.inv, flex: 1,
          onPress: (v) => { if (v <= 0) return; const id = action.id; setAction(null); update((d) => { const x = d.holdings.find((y) => y.id === id); if (x) x.value = v; }, '✓ value updated', true); },
        }],
      };
    }
    if (action.type === 'invest') {
      return {
        title: '↗  New investment', sub: 'amount invested — leaves your cash', initial: action.initial || 0, withName: true,
        actions: [{
          label: 'create', color: '#000', bg: C.inv, flex: 1,
          onPress: (v) => {
            const nm = newName.trim();
            if (v <= 0 || !nm) return;
            setAction(null);
            update((d) => {
              d.entries.push({ id: uid(), t: Date.now(), type: 'invest', cat: nm, amt: v, acc: acc });
              d.holdings.push({ id: uid(), name: nm, invested: v, value: v });
            }, '↗ ' + nm, true);
          },
        }],
      };
    }
    return null;
  })();

  const scoreRows = [
    { name: 'Savings rate', pct: Math.round(A.f1 * 100), c: A.f1 > 0.6 ? C.pos : C.neg, val: Math.round(A.saveRate * 100) + '%' },
    { name: 'Runway', pct: Math.round(A.f2 * 100), c: A.f2 > 0.5 ? C.pos : C.neg, val: A.runway.toFixed(1) + ' mo' },
    { name: 'Debt load', pct: Math.round(A.f3 * 100), c: A.f3 > 0.6 ? C.pos : C.neg, val: A.debtR > 0 ? fmt0(A.debtR) : 'none' },
    { name: 'Budget discipline', pct: Math.round(A.f4 * 100), c: A.f4 > 0.7 ? C.pos : C.neg, val: Math.round(A.f4 * 100) + '%' },
  ];

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Micro>{data.profile && data.profile.name ? 'ADVISOR · ' + data.profile.name.toUpperCase() : 'ADVISOR'}</Micro>

      {/* health score */}
      <Pressable onPress={() => { buzz(); setScoreOpen(true); }} style={({ pressed }) => [{ marginTop: 16 }, pressed && { opacity: 0.7 }]}>
        <Text>
          <Text style={{ fontSize: 44, fontWeight: '700', letterSpacing: -1, color: scoreC, fontVariant: ['tabular-nums'] }}>{A.score}</Text>
          <Text style={{ color: C.ink3, fontSize: 17, fontWeight: '600' }}> / 100</Text>
        </Text>
        <Text style={{ color: C.ink3, fontSize: 11, marginTop: 4 }}>money health · tap for the four factors</Text>
      </Pressable>

      {/* pulse */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>THIS MONTH</Micro>
      {pulse.map((p, i) => (
        <Pressable key={i} onPress={p.onTap ? () => { buzz(); p.onTap(); } : undefined} style={({ pressed }) => [s.pulseRow, pressed && p.onTap && { opacity: 0.55 }]}>
          <Text style={{ fontSize: 13, width: 28, textAlign: 'center', color: C.ink3 }}>{p.glyph}</Text>
          <Text style={{ flex: 1, color: C.ink2, fontSize: 13 }}>{p.name}</Text>
          <Text style={{ color: p.c, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{p.val}</Text>
          <Text style={{ color: C.ink4, fontSize: 11, width: 8 }}>{p.arrow}</Text>
        </Pressable>
      ))}

      {/* insights */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>INSIGHTS · RANKED BY IMPACT</Micro>
      {insights.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => { buzz(); setInsOpen(n.id); }}
          onLongPress={() => update((d) => { d.dismissedIns[n.id] = Date.now(); }, 'muted for 30 days', true)}
          delayLongPress={450}
          style={({ pressed }) => [s.insRow, pressed && { opacity: 0.55 }]}
        >
          <View style={{ width: 28, alignItems: 'center' }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: n.sev === 'red' ? C.neg : n.sev === 'good' ? C.pos : C.ink2 }} />
          </View>
          <Text style={{ flex: 1, color: C.ink, fontSize: 13.5, fontWeight: '500' }} numberOfLines={2}>{n.title}</Text>
          <Text style={{ color: n.valC, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{n.val}</Text>
        </Pressable>
      ))}
      {!insights.length && <Text style={{ color: C.ink4, fontSize: 13, paddingVertical: 12, paddingLeft: 40 }}>All clear — nothing needs your attention.</Text>}

      <Text style={s.mindful}>{mindfulLine(data, A, now)}</Text>
      <Text style={s.foot}>tap an insight for the evidence · hold to mute 30d{'\n'}all advice computed on this phone from your own entries</Text>

      {/* ------------------------------------------------------- score sheet */}
      <Sheet visible={scoreOpen} onClose={() => setScoreOpen(false)} title="✦  Money health" sub="rules on your data · nothing leaves the phone">
        <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 6 }}>
          <Text>
            <Text style={{ color: scoreC, fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{A.score}</Text>
            <Text style={{ color: C.ink3, fontSize: 16, fontWeight: '600' }}> / 100</Text>
          </Text>
        </View>
        {scoreRows.map((f) => (
          <View key={f.name} style={s.scoreRow}>
            <Text style={{ color: C.ink2, fontSize: 12.5, width: 110 }}>{f.name}</Text>
            <View style={s.scoreTrack}>
              <View style={{ width: f.pct + '%', height: 3, backgroundColor: f.c, borderRadius: 2 }} />
            </View>
            <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'right' }}>{f.val}</Text>
          </View>
        ))}
        <Text style={{ color: C.ink2, fontSize: 12.5, lineHeight: 18, marginTop: 14, textAlign: 'center' }}>{scoreLever(A, data.profile && data.profile.name)}</Text>
      </Sheet>

      {/* -------------------------------------------------------- rate sheet */}
      <Sheet visible={rateOpen} onClose={() => setRateOpen(false)} title="％  Kept of income" sub="last 6 months">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 86, marginTop: 18 }}>
          {rateBars.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 5 }}>
              <Text style={{ color: b.c, fontSize: 9, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{b.pct}</Text>
              <View style={{ width: '100%', maxWidth: 26, height: b.h, backgroundColor: b.c, borderRadius: 3, opacity: 0.85 }} />
              <Text style={{ color: C.ink4, fontSize: 9 }}>{b.label}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: C.ink3, fontSize: 11, textAlign: 'center', marginTop: 12 }}>share of income kept each month</Text>
      </Sheet>

      {/* -------------------------------------------------------- pace sheet */}
      <Sheet visible={paceOpen} onClose={() => setPaceOpen(false)} title="−  Spend pace" sub={now.toLocaleDateString(undefined, { month: 'long' }) + ' · cumulative'}>
        <View style={{ marginTop: 16 }}>
          {pd && <PaceChart cur={pd.cur} prev={pd.prev} dim={pd.dim} />}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
          <Text style={{ color: C.neg, fontSize: 10, fontWeight: '600' }}>— this month</Text>
          <Text style={{ color: C.ink3, fontSize: 10, fontWeight: '600' }}>— last month</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: A.prevSpent > 0 && pace > A.prevSpent ? C.neg : C.pos, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{paceNote}</Text>
        </View>
      </Sheet>

      {/* ----------------------------------------------------- insight sheet */}
      <Sheet visible={!!curIns} onClose={() => setInsOpen(null)} title={curIns ? '✦  ' + curIns.title : ''} sub={curIns ? curIns.val : ''}>
        {curIns && (
          <View>
            <Text style={{ color: C.ink2, fontSize: 13.5, lineHeight: 20, marginTop: 12 }}>{curIns.detail}</Text>
            {curIns.chart && (
              <View style={{ marginTop: 14 }}>
                <Bars items={curIns.chart.items} />
              </View>
            )}
            <Micro style={{ marginTop: 18, letterSpacing: 1.8 }}>EVIDENCE</Micro>
            {curIns.evidence.map((e, i) => (
              <View key={i} style={s.evRow}>
                <Text style={{ color: C.ink2, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{e}</Text>
              </View>
            ))}
            {curIns.action && (
              <Pressable onPress={() => { buzz(); runAction(curIns.action); }} style={({ pressed }) => [s.insAct, pressed && { opacity: 0.7 }]}>
                <Text style={{ color: curIns.action.c, fontSize: 15, fontWeight: '700' }}>{curIns.action.label}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Sheet>

      {/* ------------------------------------------- pre-filled action sheets */}
      {actionSheetProps && (
        <AmountSheet
          visible={!!action}
          title={actionSheetProps.title}
          sub={actionSheetProps.sub}
          cur={data.cur}
          initial={actionSheetProps.initial || 0}
          onClose={() => setAction(null)}
          actions={actionSheetProps.actions}
        >
          {actionSheetProps.withName ? <Field placeholder="name" value={newName} onChangeText={setNewName} /> : null}
        </AmountSheet>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  insRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  mindful: { color: C.ink3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 28, paddingHorizontal: 16, fontVariant: ['tabular-nums'] },
  foot: { color: C.ink4, fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  scoreTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  evRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  insAct: { height: 54, borderRadius: 16, marginTop: 16, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
});
