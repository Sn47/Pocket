import { useMemo, useState } from 'react';
import { Platform, Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { StoreProvider, buzz, useStore } from './src/store';
import { fmtDate } from './src/util';
import LogScreen from './src/screens/LogScreen';
import PlanScreen from './src/screens/PlanScreen';
import GrowScreen from './src/screens/GrowScreen';
import MoreScreen from './src/screens/MoreScreen';

const TABS = [
  { id: 'log', glyph: '＋', size: 20 },
  { id: 'plan', glyph: '▤', size: 18 },
  { id: 'grow', glyph: '◎', size: 18 },
  { id: 'more', glyph: '≡', size: 18 },
];

function Root() {
  const { ready, data, toast, undo } = useStore();
  const [tab, setTab] = useState('log');

  // red dot on Plan when something is due (hidden while on Plan, as the prototype)
  const dueDot = useMemo(() => {
    const todayS = fmtDate(new Date());
    return data.recurring.some((r) => r.next <= todayS) && tab !== 'plan';
  }, [data.recurring, tab]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 0 }}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <View style={{ flex: 1 }}>
        {tab === 'log' && <LogScreen />}
        {tab === 'plan' && <PlanScreen />}
        {tab === 'grow' && <GrowScreen />}
        {tab === 'more' && <MoreScreen />}
      </View>

      {/* ------------------------------------------------- glyph-only tab bar */}
      <View style={s.nav}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => { buzz(); setTab(t.id); }} style={s.navBtn}>
            <View>
              <Text style={{ color: tab === t.id ? C.ink : C.ink3, fontSize: t.size }}>{t.glyph}</Text>
              {t.id === 'plan' && dueDot && <View style={s.dueDot} />}
            </View>
          </Pressable>
        ))}
      </View>

      {/* --------------------------------------------------- toast / undo pill */}
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
  dueDot: { position: 'absolute', top: -2, right: -9, width: 6, height: 6, borderRadius: 3, backgroundColor: C.neg },

  toastWrap: { position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.toast,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: '86%',
  },
  toastText: { color: C.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  toastUndo: { color: C.pos, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
});
