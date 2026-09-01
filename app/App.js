import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { StoreProvider, buzz, useStore } from './src/store';
import { SP, SRC, fmtDate, fmt0 } from './src/util';
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

// ---------------------------------------------- 3-step first-run onboarding --
function Onboarding() {
  const { onb, setOnb, finishOnb } = useStore();
  if (!onb) return null;
  const nameOk = !!onb.name.trim();

  const chip = (on) => [s.onbChip, on && { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: C.ink }];

  return (
    <View style={s.onb}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 60, paddingHorizontal: 28, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={s.onbBrand}>POCKET</Text>

          {onb.step === 0 && (
            <View style={{ flex: 1 }}>
              <Text style={s.onbQ}>what should{'\n'}Pocket call you?</Text>
              <TextInput
                value={onb.name}
                onChangeText={(v) => setOnb({ ...onb, name: v })}
                placeholder="your name"
                placeholderTextColor={C.ink4}
                style={s.onbName}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
                {['Rs', '₹', '$', '€'].map((c) => (
                  <Pressable key={c} onPress={() => { buzz(); setOnb({ ...onb, cur: c }); }} style={({ pressed }) => [s.onbCur, onb.cur === c && { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: C.ink }, pressed && { transform: [{ scale: 0.95 }] }]}>
                    <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700' }}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: C.ink4, fontSize: 11, marginTop: 8 }}>your currency</Text>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => { if (nameOk) { buzz(); setOnb({ ...onb, step: 1 }); } }}
                style={({ pressed }) => [s.onbNext, { backgroundColor: nameOk ? C.ink : C.fill }, pressed && { opacity: 0.85 }]}
              >
                <Text style={{ color: nameOk ? '#000' : C.ink4, fontSize: 17, fontWeight: '700' }}>continue</Text>
              </Pressable>
            </View>
          )}

          {onb.step === 1 && (
            <View style={{ flex: 1 }}>
              <Text style={s.onbQ}>{'where does your money come from' + (onb.name.trim() ? ', ' + onb.name.trim() : '') + '?'}</Text>
              <Text style={s.onbSub}>pick all that apply — these become your ＋ income categories</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 }}>
                {SRC.map(([e, n]) => (
                  <Pressable
                    key={n}
                    onPress={() => { buzz(); const s3 = onb.sources.includes(n) ? onb.sources.filter((x) => x !== n) : [...onb.sources, n]; setOnb({ ...onb, sources: s3 }); }}
                    style={({ pressed }) => [chip(onb.sources.includes(n)), pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <Text style={{ fontSize: 17 }}>{e}</Text>
                    <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => { if (onb.sources.length) { buzz(); setOnb({ ...onb, step: 2 }); } }}
                style={({ pressed }) => [s.onbNext, { backgroundColor: onb.sources.length ? C.ink : C.fill }, pressed && { opacity: 0.85 }]}
              >
                <Text style={{ color: onb.sources.length ? '#000' : C.ink4, fontSize: 17, fontWeight: '700' }}>continue</Text>
              </Pressable>
              <Pressable onPress={() => { buzz(); finishOnb(onb); }} style={({ pressed }) => [{ paddingTop: 16, alignItems: 'center' }, pressed && { opacity: 0.6 }]}>
                <Text style={{ color: C.ink3, fontSize: 13, fontWeight: '600' }}>skip for now</Text>
              </Pressable>
            </View>
          )}

          {onb.step === 2 && (
            <View style={{ flex: 1 }}>
              <Text style={s.onbQ}>{'what do you spend on most' + (onb.name.trim() ? ', ' + onb.name.trim() : '') + '?'}</Text>
              <Text style={s.onbSub}>pick up to three — they sit first on your keypad</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 }}>
                {SP.filter((x) => x[1] !== 'Other').map(([e, n]) => (
                  <Pressable
                    key={n}
                    onPress={() => { buzz(); const t3 = onb.tops.includes(n) ? onb.tops.filter((x) => x !== n) : [...onb.tops, n].slice(0, 3); setOnb({ ...onb, tops: t3 }); }}
                    style={({ pressed }) => [chip(onb.tops.includes(n)), pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <Text style={{ fontSize: 17 }}>{e}</Text>
                    <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => { buzz(); finishOnb(onb); }} style={({ pressed }) => [s.onbNext, { backgroundColor: C.pos }, pressed && { opacity: 0.85 }]}>
                <Text style={{ color: '#000', fontSize: 17, fontWeight: '700' }}>start</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function LockScreen({ pin, brand, onUnlock }) {
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
      <Text style={s.lockBrand}>{brand}</Text>
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
  const { ready, data, tab, setTab, toast, undo, sweepOffer, takeSweepOffer, catsFor, onb } = useStore();
  const [locked, setLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);

  useEffect(() => {
    if (ready && !lockChecked) {
      setLocked(!!data.pin);
      setLockChecked(true);
    }
  }, [ready]);

  const dueDot = useMemo(() => {
    const todayS = fmtDate(new Date());
    return data.recurring.some((r) => r.next <= todayS && r.amt > 0) && tab !== 'plan';
  }, [data.recurring, tab]);

  const advDot = useMemo(() => {
    if (tab === 'adv') return false;
    const A = analyze(data);
    return buildInsights(data, A, data.cur, catsFor('spent')).some((x) => x.sev === 'red');
  }, [data, tab]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const brand = data.profile && data.profile.name ? 'POCKET · ' + data.profile.name.toUpperCase() : 'POCKET';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 0 }}>
      <StatusBar style="light" backgroundColor={C.bg} />
      {locked ? (
        <LockScreen pin={data.pin} brand={brand} onUnlock={() => setLocked(false)} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {tab === 'log' && <LogScreen />}
            {tab === 'plan' && <PlanScreen />}
            {tab === 'adv' && <AdvisorScreen />}
            {tab === 'grow' && <GrowScreen />}
            {tab === 'more' && <MoreScreen />}
          </View>

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

      {/* salary sweep offer */}
      {!locked && !onb && sweepOffer && (
        <View style={s.offerWrap} pointerEvents="box-none">
          <Pressable onPress={takeSweepOffer} style={({ pressed }) => [s.offer, pressed && { backgroundColor: C.posSoft }]}>
            <Text style={{ color: C.pos, fontSize: 14 }}>◎</Text>
            <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              sweep 20% to goal · {fmt0(sweepOffer)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* toast / undo */}
      {toast && (
        <View style={s.toastWrap} pointerEvents="box-none">
          <Pressable style={s.toast} onPress={toast.undoable ? undo : undefined}>
            <Text style={s.toastText}>{toast.msg}</Text>
            {toast.undoable && <Text style={s.toastUndo}>UNDO</Text>}
          </Pressable>
        </View>
      )}

      {/* first-run / edit-profile onboarding overlay */}
      {!locked && <Onboarding />}
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

  onb: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 110 },
  onbBrand: { color: C.ink3, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  onbQ: { color: C.ink, fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginTop: 44, lineHeight: 36 },
  onbSub: { color: C.ink3, fontSize: 13, marginTop: 10, lineHeight: 18 },
  onbName: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.14)', color: C.ink, fontSize: 22, fontWeight: '600', paddingVertical: 14, marginTop: 36 },
  onbCur: { width: 52, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'transparent' },
  onbChip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'transparent' },
  onbNext: { height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 24 },

  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 },
  lockBrand: { color: C.ink3, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  dots: { flexDirection: 'row', gap: 14 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  lockPad: { flexDirection: 'row', flexWrap: 'wrap', width: 234, justifyContent: 'center' },
  lockKey: { width: 78, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lockKeyText: { color: C.ink, fontSize: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
