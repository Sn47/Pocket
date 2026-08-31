import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { StoreProvider, buzz, useStore } from './src/store';
import { fmtDate, fmt0 } from './src/util';
import { analyze, buildInsights } from './src/logic';
import LogScreen from './src/screens/LogScreen';
import PlanScreen from './src/screens/PlanScreen';
import AdvisorScreen from './src/screens/AdvisorScreen';
import GrowScreen from './src/screens/GrowScreen';
import MoreScreen from './src/screens/MoreScreen';

const TABS = [
  { id: 'log', glyph: '＋', size: 20 },
  { id: 'plan', glyph: '▤', size: 18 },
  { id: 'adv', glyph: '✦', size: 19 },
  { id: 'grow', glyph: '◎', size: 18 },
  { id: 'more', glyph: '≡', size: 18 },
];

// full-screen 4-digit PIN lock (red flash on wrong PIN)
function LockScreen({ pin, onUnlock }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState(false);

  const press = (k) => {
    buzz();
    if (k === '⌫') { setVal((p) => p.slice(0, -1)); return; }
    const next = (val + k).slice(0, 4);
    if (next.length === 4) {
      if (next === pin) onUnlock();
      else { setErr(true); setVal(''); setTimeout(() => setErr(false), 450); }
    } else setVal(next);
  };

  return (
    <View style={s.lock}>
      <Text style={s.lockBrand}>POCKET</Text>
      <View style={s.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.dot, { backgroundColor: err ? C.neg : i < val.length ? C.ink : 'rgba(255,255,255,0.15)' }]} />
        ))}
      </View>
      <View style={s.lockPad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <Pressable key={i} disabled={!k} onPress={() => press(k)} style={({ pressed }) => [s.lockKey, pressed && { backgroundColor: C.fillSel }]}>
            <Text style={[s.lockKeyText, k === '⌫' && { fontSize: 19, color: C.ink3 }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Root() {
  const { ready, data, tab, setTab, toast, undo, sweepOffer, takeSweepOffer, catsFor } = useStore();
  const [locked, setLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);

  useEffect(() => {
    if (ready && !lockChecked) {
      setLocked(!!data.pin);
      setLockChecked(true);
    }
  }, [ready]);

  // red dots: ▤ when a bill is due · ✦ when a red-severity insight exists
  const dueDot = useMemo(() => {
    const todayS = fmtDate(new Date());
    return data.recurring.some((r) => r.next <= todayS) && tab !== 'plan';
  }, [data.recurring, tab]);

  const advDot = useMemo(() => {
    if (tab === 'adv') return false;
    const A = analyze(data);
    return buildInsights(data, A, data.cur, catsFor('spent')).some((x) => x.sev === 'red');
  }, [data, tab]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 0 }}>
      <StatusBar style="light" backgroundColor={C.bg} />
      {locked ? (
        <LockScreen pin={data.pin} onUnlock={() => setLocked(false)} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {tab === 'log' && <LogScreen />}
            {tab === 'plan' && <PlanScreen />}
            {tab === 'adv' && <AdvisorScreen />}
            {tab === 'grow' && <GrowScreen />}
            {tab === 'more' && <MoreScreen />}
          </View>

          {/* glyph-only tab bar: ＋ ▤ ✦ ◎ ≡ */}
          <View style={s.nav}>
            {TABS.map((t) => (
              <Pressable key={t.id} onPress={() => { buzz(); setTab(t.id); }} style={s.navBtn} hitSlop={6}>
                <View>
                  <Text style={{ color: tab === t.id ? C.ink : C.ink3, fontSize: t.size }}>{t.glyph}</Text>
                  {t.id === 'plan' && dueDot && <View style={s.redDot} />}
                  {t.id === 'adv' && advDot && <View style={s.redDot} />}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* salary sweep offer: one-tap 20% to goal, 5s */}
      {!locked && sweepOffer && (
        <View style={s.offerWrap} pointerEvents="box-none">
          <Pressable onPress={takeSweepOffer} style={({ pressed }) => [s.offer, pressed && { backgroundColor: C.posSoft }]}>
            <Text style={{ color: C.pos, fontSize: 14 }}>◎</Text>
            <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              sweep 20% to goal · {fmt0(sweepOffer)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* toast / undo pill */}
      {toast && (
        <View style={s.toastWrap} pointerEvents="box-none">
          <Pressable style={s.toast} onPress={toast.undoable ? undo : undefined}>
            <Text style={s.toastText}>{toast.msg}</Text>
            {toast.undoable && <Text style={s.toastUndo}>UNDO</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

const s = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'android' ? 10 : 0,
  },
  navBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  redDot: { position: 'absolute', top: -2, right: -9, width: 6, height: 6, borderRadius: 3, backgroundColor: C.neg },

  offerWrap: { position: 'absolute', bottom: 152, left: 0, right: 0, alignItems: 'center' },
  offer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.toast, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(48,209,88,0.35)',
  },

  toastWrap: { position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.toast, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxWidth: '86%',
  },
  toastText: { color: C.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  toastUndo: { color: C.pos, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 },
  lockBrand: { color: C.ink3, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  dots: { flexDirection: 'row', gap: 14 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  lockPad: { flexDirection: 'row', flexWrap: 'wrap', width: 234, justifyContent: 'center' },
  lockKey: { width: 78, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lockKeyText: { color: C.ink, fontSize: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
