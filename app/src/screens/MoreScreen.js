import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { C, GRAYS } from '../theme';
import { buzz, useStore } from '../store';
import { CURRENCIES, MOODS, emojiFor, fmt0, monthOf, toCsv } from '../util';
import { EmojiPicker, Micro, Sheet } from '../ui';
import { Donut, LineChart, MonthBars, Sparkline } from '../charts';

export default function MoreScreen() {
  const { data, update, accName, totals, show, restoreDemo } = useStore();

  const [chart, setChart] = useState(null); // 'cash'|'net'|'months' or {donut, ym, label}
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodPick, setMoodPick] = useState(null); // tier whose emoji picker is open
  const [pinOpen, setPinOpen] = useState(false);
  const [pinVal, setPinVal] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const t = totals;
  const rate = t.mGot > 0 ? Math.round(((t.mGot - t.mSpent) / t.mGot) * 100) : null;
  const now = new Date();
  const ym = monthOf(Date.now());

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
    const m = {};
    let sp = 0;
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === ym) { m[e.cat] = (m[e.cat] || 0) + e.amt; sp += e.amt; }
    return { byCat: m, catList: Object.keys(m).sort((a, b) => m[b] - m[a]), mSpent: sp };
  }, [data.entries]);

  const months = useMemo(() => {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() * 100 + d.getMonth();
      let spent = 0, got = 0;
      for (const e of data.entries) {
        if (monthOf(e.t) !== key) continue;
        if (e.type === 'spent') spent += e.amt;
        else if (e.type === 'got') got += e.amt;
      }
      out.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), spent, got, key });
    }
    return out;
  }, [data.entries]);

  const topCat = catList[0];

  // donut sheet — for any month
  const donutState = chart && typeof chart === 'object' ? chart : chart === 'donut' ? { ym, label: now.toLocaleDateString(undefined, { month: 'long' }) } : null;
  const donutData = useMemo(() => {
    if (!donutState) return null;
    const bc = {};
    let tot2 = 0;
    for (const e of data.entries) if (e.type === 'spent' && monthOf(e.t) === donutState.ym) { bc[e.cat] = (bc[e.cat] || 0) + e.amt; tot2 += e.amt; }
    const cl = Object.keys(bc).sort((a, b) => bc[b] - bc[a]);
    return { bc, cl, tot2 };
  }, [donutState && donutState.ym, data.entries]);

  const glance = [
    { glyph: '∿', name: 'Cash', spark: <Sparkline values={cashSeries.slice(-30)} color={C.pos} />, val: fmt0(t.cash), color: C.ink, onTap: () => setChart('cash') },
    { glyph: '◆', name: 'Net worth', spark: <Sparkline values={netSeries.slice(-30)} color={C.ink2} />, val: fmt0(t.net), color: C.ink, onTap: () => setChart('net') },
    { glyph: '◔', name: 'Where it goes', spark: null, val: topCat ? emojiFor(topCat) + ' ' + Math.round(((byCat[topCat] || 0) / (mSpent || 1)) * 100) + '%' : '—', color: C.ink2, onTap: () => setChart('donut') },
    { glyph: '▥', name: 'Months', spark: null, val: '−' + fmt0(t.mSpent) + ' +' + fmt0(t.mGot), color: C.ink2, onTap: () => setChart('months') },
    { glyph: '％', name: 'Saved this month', spark: null, val: rate === null ? '—' : rate + '%', color: rate !== null && rate < 0 ? C.neg : C.pos, onTap: null },
  ];

  const cycleCur = () => update((d) => { d.cur = CURRENCIES[(CURRENCIES.indexOf(d.cur) + 1) % CURRENCIES.length]; });

  const wipeYes = () => {
    setConfirmWipe(false);
    update((d) => { d.entries = []; d.goals = []; d.debts = []; d.holdings = []; d.recurring = []; d.snapshots = {}; d.pins = []; }, 'Erased');
  };

  const pinDigit = (k) => {
    buzz();
    if (k === '⌫') { setPinVal((p) => p.slice(0, -1)); return; }
    const v = (pinVal + k).slice(0, 4);
    if (v.length === 4) {
      update((d) => { d.pin = v; }, '✓ PIN set');
      setPinVal(''); setPinOpen(false);
    } else setPinVal(v);
  };

  const row = ({ key, glyph, glyphColor, name, nameColor, sub, right, onTap, last }) => (
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

      <View style={{ marginTop: 8 }}>
        {glance.map((g) => (
          <Pressable key={g.name} onPress={g.onTap ? () => { buzz(); g.onTap(); } : undefined} style={({ pressed }) => [s.row, pressed && g.onTap && { opacity: 0.55 }]}>
            <Text style={s.glyph}>{g.glyph}</Text>
            <Text style={s.name}>{g.name}</Text>
            <View style={{ width: 64, height: 18, justifyContent: 'center' }}>{g.spark}</View>
            <Text style={{ color: g.color, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 82, textAlign: 'right' }}>{g.val}</Text>
          </Pressable>
        ))}
      </View>

      <Micro style={{ marginTop: 26, letterSpacing: 1.8 }}>SETTINGS</Micro>
      {row({
        key: 'sweep', glyph: '◎', name: 'Round-up sweeps', sub: 'spare change → nearest goal',
        right: <Text style={{ color: data.sweep === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.sweep === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.sweep = d.sweep === false; }),
      })}
      {row({
        key: 'buzz', glyph: '〰', name: 'Haptics',
        right: <Text style={{ color: data.buzzOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.buzzOn === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.buzzOn = d.buzzOn === false; }),
      })}
      {row({
        key: 'mood', glyph: '😸', name: 'Money mood', sub: 'emoji list · tap',
        right: <Text style={{ color: data.moodOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.moodOn === false ? 'off' : 'on'}</Text>,
        onTap: () => setMoodOpen(true),
      })}
      {row({
        key: 'ambient', glyph: '∗', name: 'Ambient hints', sub: 'safe today · pace · bill radar',
        right: <Text style={{ color: data.ambientOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.ambientOn === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.ambientOn = d.ambientOn === false; }),
      })}
      {row({
        key: 'offer', glyph: '◎', name: 'Salary sweep offer', sub: 'big income → 20% pill',
        right: <Text style={{ color: data.offerOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.offerOn === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.offerOn = d.offerOn === false; }),
      })}
      {row({
        key: 'suggest', glyph: '🔁', name: 'Recurring suggestions', sub: 'spotted in your entries',
        right: <Text style={{ color: data.suggestOn === false ? C.ink3 : C.pos, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.suggestOn === false ? 'off' : 'on'}</Text>,
        onTap: () => update((d) => { d.suggestOn = d.suggestOn === false; }),
      })}
      {row({
        key: 'pin', glyph: '◉', name: 'PIN lock', sub: data.pin ? 'tap to remove' : 'locks on open',
        right: <Text style={{ color: data.pin ? C.pos : C.ink3, fontSize: 12, fontWeight: '700', minWidth: 26, textAlign: 'right' }}>{data.pin ? 'on' : 'off'}</Text>,
        onTap: () => { if (data.pin) update((d) => { d.pin = ''; }, 'PIN removed'); else { setPinVal(''); setPinOpen(true); } },
      })}
      {row({ key: 'cur', glyph: data.cur, glyphColor: C.ink2, name: 'Currency', sub: 'tap to change', onTap: cycleCur })}
      {row({ key: 'json', glyph: '⇪', name: 'Backup', sub: 'JSON', onTap: () => { Share.share({ message: JSON.stringify(data, null, 2) }).catch(() => {}); show('⇪ backup copied'); } })}
      {row({ key: 'csv', glyph: '⇪', name: 'Transactions', sub: 'CSV', onTap: () => { Share.share({ message: toCsv(data, accName) }).catch(() => {}); show('⇪ CSV copied'); } })}
      {row({ key: 'demo', glyph: '↺', name: 'Restore sample data', onTap: restoreDemo })}
      {row({ key: 'wipe', glyph: '⌫', glyphColor: C.neg, name: 'Erase everything', nameColor: C.neg, onTap: () => setConfirmWipe(true), last: true })}

      <Text style={s.foot}>All data stays on this phone.</Text>

      {/* chart sheets */}
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

      <Sheet visible={!!donutState} onClose={() => setChart(null)} title="◔  Where it goes" sub={donutState ? donutState.label : ''}>
        {donutData && (
          <View>
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              {donutData.cl.length ? <Donut slices={donutData.cl.map((c, i) => ({ v: donutData.bc[c], c: GRAYS[Math.min(i, 6)] }))} /> : <Text style={s.empty}>Not enough data yet.</Text>}
            </View>
            <View style={{ marginTop: 8 }}>
              {donutData.cl.slice(0, 7).map((c, i) => (
                <View key={c} style={s.legendRow}>
                  <Text style={{ fontSize: 15, width: 24, textAlign: 'center' }}>{emojiFor(c)}</Text>
                  <Text style={{ flex: 1, color: C.ink2, fontSize: 12.5 }} numberOfLines={1}>{c}</Text>
                  <View style={s.legendTrack}>
                    <View style={{ width: Math.round((donutData.bc[c] / (donutData.tot2 || 1)) * 100) + '%', height: 3, backgroundColor: GRAYS[Math.min(i, 6)] }} />
                  </View>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], width: 34, textAlign: 'right' }}>
                    {Math.round((donutData.bc[c] / (donutData.tot2 || 1)) * 100)}%
                  </Text>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'right' }}>{fmt0(donutData.bc[c])}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Sheet>

      <Sheet visible={chart === 'months'} onClose={() => setChart(null)} title="▥  Year" sub="spent vs got · tap a month">
        <View style={{ marginTop: 16 }}>
          <MonthBars months={months} onPick={(m) => setChart({ ym: m.key, label: m.label })} />
        </View>
      </Sheet>

      {/* money mood sheet: toggle + the three emoji tiers */}
      <Sheet visible={moodOpen} onClose={() => setMoodOpen(false)} title="😸  Money mood" sub="balance hides behind an emoji">
        <Pressable
          onPress={() => { buzz(); update((d) => { d.moodOn = d.moodOn === false; }); }}
          style={({ pressed }) => [s.moodToggle, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600', flex: 1 }}>Hide balance by default</Text>
          <Text style={{ color: data.moodOn === false ? C.ink3 : C.pos, fontSize: 13, fontWeight: '800' }}>{data.moodOn === false ? 'off' : 'on'}</Text>
        </Pressable>
        <Text style={{ color: C.ink3, fontSize: 11.5, lineHeight: 17, marginTop: 12 }}>
          The emoji is picked from your runway tier and rotates as you log. Tap an emoji to remove it, type to add your own.
        </Text>
        {[
          ['ok', 'COMFORTABLE · 3+ MONTHS RUNWAY', C.pos],
          ['tight', 'TIGHT · 1–3 MONTHS', C.ink2],
          ['low', 'TROUBLE · UNDER A MONTH', C.neg],
        ].map(([tier, label, col]) => {
          const pool = (data.moods && data.moods[tier]) || MOODS[tier];
          return (
            <View key={tier} style={{ marginTop: 18 }}>
              <Text style={{ color: col, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }}>{label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {pool.map((em, i) => (
                  <Pressable
                    key={em + i}
                    onPress={() => {
                      if (pool.length <= 1) { show('keep at least one'); return; }
                      buzz();
                      update((d) => { d.moods[tier] = d.moods[tier].filter((_, j) => j !== i); }, em + ' removed', true);
                    }}
                    style={({ pressed }) => [s.moodChip, pressed && { backgroundColor: C.negSoft, transform: [{ scale: 0.9 }] }]}
                  >
                    <Text style={{ fontSize: 20 }}>{em}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => { buzz(); setMoodPick(moodPick === tier ? null : tier); }}
                  style={({ pressed }) => [s.moodAdd, moodPick === tier && { borderColor: C.ink, borderStyle: 'solid' }, pressed && { opacity: 0.6 }]}
                >
                  <Text style={{ color: moodPick === tier ? C.ink : C.ink4, fontSize: 18, fontWeight: '700' }}>＋</Text>
                </Pressable>
              </View>
              {moodPick === tier && (
                <EmojiPicker
                  onPick={(em) => {
                    setMoodPick(null);
                    update((d) => { if (!d.moods[tier].includes(em)) d.moods[tier] = d.moods[tier].concat(em); }, '✓ ' + em, true);
                  }}
                />
              )}
            </View>
          );
        })}
        <Pressable
          onPress={() => { buzz(); update((d) => { d.moods = { ok: [...MOODS.ok], tight: [...MOODS.tight], low: [...MOODS.low] }; }, '↺ moods reset', true); }}
          style={({ pressed }) => [{ paddingVertical: 14 }, pressed && { opacity: 0.6 }]}
        >
          <Text style={{ color: C.ink3, fontSize: 13, fontWeight: '600' }}>↺ reset to defaults</Text>
        </Pressable>
      </Sheet>

      {/* PIN set sheet: 4-digit dot pad */}
      <Sheet visible={pinOpen} onClose={() => { setPinOpen(false); setPinVal(''); }} title="◉  Set PIN" sub="local only · no recovery">
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 22, marginBottom: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i < pinVal.length ? C.ink : 'rgba(255,255,255,0.15)' }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
            <Pressable
              key={i}
              disabled={!k}
              onPress={() => pinDigit(k)}
              style={({ pressed }) => [s.pinKey, pressed && { backgroundColor: C.fillSel }]}
            >
              <Text style={{ color: k === '⌫' ? C.ink3 : C.ink, fontSize: k === '⌫' ? 19 : 24, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{k}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* wipe confirm — the only confirmation in the app */}
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
  empty: { color: C.ink4, fontSize: 13, paddingVertical: 14, textAlign: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  legendTrack: { width: 80, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  pinKey: { width: '33.33%', height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  moodToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 14 },
  moodChip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  moodAdd: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
  wipeWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  wipeBox: { backgroundColor: C.toast, borderRadius: 22, padding: 24, width: 260, alignItems: 'center' },
  wipeBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
