import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { C, GRAYS } from '../theme';
import { buzz, useStore } from '../store';
import { CURRENCIES, emojiFor, fmt0, monthOf, toCsv } from '../util';
import { Micro, Sheet } from '../ui';
import { Donut, LineChart, MonthBars, Sparkline } from '../charts';

export const sha = (s) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'pocket:' + s);

export default function MoreScreen() {
  const { data, update, accName, totals, show } = useStore();

  const [chart, setChart] = useState(null); // 'cash' | 'net' | 'donut' | 'months'
  const [confirmWipe, setConfirmWipe] = useState(false);

  const t = totals;
  const rate = t.mGot > 0 ? Math.round(((t.mGot - t.mSpent) / t.mGot) * 100) : null;

  // ------------------------------------------------------------ chart data --
  const { cashSeries, netSeries } = useMemo(() => {
    const byDay = new Map();
    for (const e of data.entries) {
      const k = new Date(e.t).toDateString();
      const v = e.type === 'got' ? e.amt : e.type === 'spent' || e.type === 'invest' ? -e.amt : 0;
      byDay.set(k, (byDay.get(k) || 0) + v);
    }
    const keys = [...byDay.keys()].sort((a, b) => new Date(a) - new Date(b));
    let acc = data.accounts.reduce((a, x) => a + (x.init || 0), 0);
    const cash = keys.map((k) => { acc += byDay.get(k); return acc / 100; });
    const off = (t.invV - t.debtR) / 100;
    return { cashSeries: cash, netSeries: cash.map((v) => v + off) };
  }, [data.entries, data.accounts, t.invV, t.debtR]);

  const { byCat, catList, mSpent } = useMemo(() => {
    const ym = monthOf(Date.now());
    const m = {};
    let sp = 0;
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === ym) { m[e.cat] = (m[e.cat] || 0) + e.amt; sp += e.amt; }
    return { byCat: m, catList: Object.keys(m).sort((a, b) => m[b] - m[a]), mSpent: sp };
  }, [data.entries]);

  const months = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() * 100 + d.getMonth();
      let spent = 0, got = 0;
      for (const e of data.entries) {
        if (monthOf(e.t) !== key) continue;
        if (e.type === 'spent') spent += e.amt;
        else if (e.type === 'got') got += e.amt;
      }
      out.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), spent, got });
    }
    return out;
  }, [data.entries]);

  const topCat = catList[0];

  const glanceRows = [
    { glyph: '∿', name: 'Cash', spark: <Sparkline values={cashSeries.slice(-30)} color={C.pos} />, val: fmt0(t.cash), color: C.ink, onTap: () => setChart('cash') },
    { glyph: '◆', name: 'Net worth', spark: <Sparkline values={netSeries.slice(-30)} color={C.ink2} />, val: fmt0(t.net), color: C.ink, onTap: () => setChart('net') },
    { glyph: '◔', name: 'Where it goes', spark: null, val: topCat ? emojiFor(topCat) + ' ' + Math.round((byCat[topCat] / (mSpent || 1)) * 100) + '%' : '—', color: C.ink2, onTap: () => setChart('donut') },
    { glyph: '▥', name: 'Months', spark: null, val: '−' + fmt0(t.mSpent) + ' +' + fmt0(t.mGot), color: C.ink2, onTap: () => setChart('months') },
    { glyph: '％', name: 'Saved this month', spark: null, val: rate === null ? '—' : rate + '%', color: rate !== null && rate < 0 ? C.neg : C.pos, onTap: null },
  ];

  const cycleCur = () => update((d) => { d.cur = CURRENCIES[(CURRENCIES.indexOf(d.cur) + 1) % CURRENCIES.length]; });

  const wipeYes = () => {
    setConfirmWipe(false);
    update((d) => {
      d.entries = []; d.goals = []; d.debts = []; d.holdings = []; d.recurring = []; d.snapshots = {};
    }, 'Erased');
  };

  const setRow = ({ key, glyph, glyphColor, name, nameColor, sub, right, onTap, last }) => (
    <Pressable key={key} onPress={onTap ? () => { buzz(); onTap(); } : undefined} style={({ pressed }) => [s.row, last && { borderBottomWidth: 0 }, pressed && onTap && { opacity: 0.55 }]}>
      <Text style={[s.glyph, glyphColor && { color: glyphColor }]}>{glyph}</Text>
      <Text style={[s.name, nameColor && { color: nameColor }]}>{name}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
      {right}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Micro>MORE</Micro>

      {/* -------------------------------------------------------- glance rows */}
      <View style={{ marginTop: 8 }}>
        {glanceRows.map((g) => (
          <Pressable key={g.name} onPress={g.onTap ? () => { buzz(); g.onTap(); } : undefined} style={({ pressed }) => [s.row, pressed && g.onTap && { opacity: 0.55 }]}>
            <Text style={s.glyph}>{g.glyph}</Text>
            <Text style={s.name}>{g.name}</Text>
            <View style={{ width: 64, height: 18, justifyContent: 'center' }}>{g.spark}</View>
            <Text style={{ color: g.color, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 82, textAlign: 'right' }}>{g.val}</Text>
          </Pressable>
        ))}
      </View>

      {/* ----------------------------------------------------------- settings */}
      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>SETTINGS</Micro>
      {setRow({
        key: 'sweep', glyph: '◎', name: 'Round-up sweeps', sub: 'spare change → nearest goal',
        right: <Text style={{ color: data.sweep === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.sweep === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.sweep = d.sweep === false; }),
      })}
      {setRow({
        key: 'buzz', glyph: '〰', name: 'Haptics',
        right: <Text style={{ color: data.buzzOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.buzzOn === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.buzzOn = d.buzzOn === false; }),
      })}
      {setRow({ key: 'cur', glyph: data.cur, glyphColor: C.ink2, name: 'Currency', sub: 'tap to change', onTap: cycleCur })}
      {setRow({ key: 'json', glyph: '⇪', name: 'Backup', sub: 'JSON', onTap: () => { Share.share({ message: JSON.stringify(data, null, 2) }).catch(() => {}); show('⇪ backup copied'); } })}
      {setRow({ key: 'csv', glyph: '⇪', name: 'Transactions', sub: 'CSV', onTap: () => { Share.share({ message: toCsv(data, accName) }).catch(() => {}); show('⇪ CSV copied'); } })}
      {setRow({ key: 'wipe', glyph: '⌫', glyphColor: C.neg, name: 'Erase everything', nameColor: C.neg, onTap: () => setConfirmWipe(true), last: true })}

      <Text style={s.foot}>All data stays on this phone.</Text>

      {/* --------------------------------------------------------- chart sheets */}
      <Sheet visible={chart === 'cash'} onClose={() => setChart(null)} title="∿  Cash" sub="90 days">
        <View style={{ marginTop: 16 }}>
          {cashSeries.length > 1 ? <LineChart values={cashSeries} color={C.pos} height={120} /> : <Text style={s.empty}>Not enough data yet.</Text>}
        </View>
      </Sheet>

      <Sheet visible={chart === 'net'} onClose={() => setChart(null)} title="◆  Net worth" sub={fmt0(t.net)}>
        <View style={{ marginTop: 16 }}>
          {netSeries.length > 1 ? <LineChart values={netSeries} color={C.inv} height={120} /> : <Text style={s.empty}>Not enough data yet.</Text>}
        </View>
      </Sheet>

      <Sheet visible={chart === 'donut'} onClose={() => setChart(null)} title="◔  Where it goes" sub={new Date().toLocaleDateString(undefined, { month: 'long' })}>
        <View style={{ marginTop: 16, alignItems: 'center' }}>
          {catList.length ? <Donut slices={catList.map((c, i) => ({ v: byCat[c], c: GRAYS[Math.min(i, 6)] }))} /> : <Text style={s.empty}>Not enough data yet.</Text>}
        </View>
        <View style={{ marginTop: 8 }}>
          {catList.slice(0, 7).map((c, i) => (
            <View key={c} style={s.legendRow}>
              <Text style={{ fontSize: 15, width: 24, textAlign: 'center' }}>{emojiFor(c)}</Text>
              <Text style={{ flex: 1, color: C.ink2, fontSize: 12.5 }} numberOfLines={1}>{c}</Text>
              <View style={s.legendTrack}>
                <View style={{ width: Math.round((byCat[c] / (mSpent || 1)) * 100) + '%', height: 3, backgroundColor: GRAYS[Math.min(i, 6)] }} />
              </View>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], width: 34, textAlign: 'right' }}>
                {Math.round((byCat[c] / (mSpent || 1)) * 100)}%
              </Text>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'right' }}>{fmt0(byCat[c])}</Text>
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet visible={chart === 'months'} onClose={() => setChart(null)} title="▥  Months" sub="spent vs got">
        <View style={{ marginTop: 16 }}>
          <MonthBars months={months} />
        </View>
      </Sheet>

      {/* ----------------------------------------- wipe confirm (the only one) */}
      <Modal visible={confirmWipe} transparent animationType="fade" onRequestClose={() => setConfirmWipe(false)}>
        <View style={s.wipeWrap}>
          <View style={s.wipeBox}>
            <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700' }}>Erase everything?</Text>
            <Text style={{ color: C.ink2, fontSize: 12, marginTop: 6, lineHeight: 17, textAlign: 'center' }}>
              Every entry, goal and debt. This is the only thing Pocket ever asks twice about.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, alignSelf: 'stretch' }}>
              <Pressable onPress={() => { buzz(); setConfirmWipe(false); }} style={({ pressed }) => [s.wipeBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }, pressed && { opacity: 0.7 }]}>
                <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>Keep</Text>
              </Pressable>
              <Pressable onPress={() => { buzz(); wipeYes(); }} style={({ pressed }) => [s.wipeBtn, { backgroundColor: pressed ? C.neg : C.negSoft }]}>
                {({ pressed }) => <Text style={{ color: pressed ? '#000' : C.neg, fontSize: 14, fontWeight: '700' }}>Erase</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  glyph: { fontSize: 16, width: 28, textAlign: 'center', color: C.ink2 },
  name: { flex: 1, color: C.ink, fontSize: 14, fontWeight: '500' },
  sub: { color: C.ink3, fontSize: 11 },
  foot: { color: C.ink4, fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
  empty: { color: C.ink4, fontSize: 13, paddingVertical: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  legendTrack: { width: 80, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  wipeWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  wipeBox: { backgroundColor: C.toast, borderRadius: 22, padding: 24, width: 260, alignItems: 'center' },
  wipeBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
