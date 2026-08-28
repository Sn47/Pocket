import { useEffect, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { C } from './theme';
import { buzz } from './store';
import { fmt } from './util';

// ------------------------------------------------------------ micro label --
export const Micro = ({ children, style, dim }) => (
  <Text style={[u.micro, dim && { color: C.ink4 }, style]}>{children}</Text>
);

// ----------------------------------------------------------------- fields --
export const Field = (props) => (
  <TextInput placeholderTextColor={C.ink4} {...props} style={[u.field, props.style]} />
);

// ------------------------------------------------------------------ sheet --
// prototype: #141418, radius 26 top, grabber, title 16/700 + sub right (baseline)
// swipe down anywhere (when the list is at its top) to dismiss
export function Sheet({ visible, onClose, title, sub, children }) {
  const drag = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const scrollEnabled = useRef(true);
  const [canScroll, setCanScroll] = useState(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => { if (visible) { drag.setValue(0); setCanScroll(true); } }, [visible]);

  const release = (g) => {
    if (g.dy > 90 || g.vy > 0.55) {
      Animated.timing(drag, { toValue: 700, duration: 150, useNativeDriver: true }).start(() => closeRef.current && closeRef.current());
    } else {
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    }
    setCanScroll(true);
  };

  // dedicated handle: grabber + title row — always draggable, never contested
  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
      onPanResponderRelease: (_, g) => release(g),
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  // body: claim downward pulls when the list is already at its top,
  // and disable the inner scroll while dragging so it can't fight back
  const bodyPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        scrollY.current <= 1 && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderGrant: () => setCanScroll(false),
      onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
      onPanResponderRelease: (_, g) => release(g),
      onPanResponderTerminate: () => { setCanScroll(true); Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(); },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={u.backdrop} onPress={onClose} />
        <Animated.View style={[u.sheet, { transform: [{ translateY: drag }] }]}>
          <View {...handlePan.panHandlers} style={u.handle}>
            <View style={u.grabber} />
            {(title || sub) && (
              <View style={u.sheetHead}>
                <Text style={u.sheetTitle}>{title}</Text>
                {sub ? <Text style={u.sheetSub}>{sub}</Text> : null}
              </View>
            )}
          </View>
          <View style={{ flexShrink: 1 }} {...bodyPan.panHandlers}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              scrollEnabled={canScroll}
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={{ paddingBottom: 44 }}
              onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              {children}
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ----------------------------------------------------------------- keypad --
// Whole-number entry (stored as cents internally): digits append whole units.
export const padAdvance = (amt, k) => {
  if (k === '⌫') return Math.floor(amt / 1000) * 100;
  if (k === '00') return Math.min(amt * 100, 9999999999);
  return Math.min(amt * 10 + Number(k) * 100, 9999999999);
};

export function KeyPad({ onKey, keyH = 52, radius = 16 }) {
  return (
    <View style={u.pad}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map((k) => {
        const alt = k === '00' || k === '⌫';
        return (
          <Pressable
            key={k}
            onPress={() => { buzz(); onKey(k); }}
            style={({ pressed }) => [u.key, { height: keyH, borderRadius: radius }, pressed && u.keyPress]}
          >
            <Text style={[u.keyText, alt && { color: C.ink3, fontSize: 19 }]}>{k}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ----------------------------------------------------------- amount text --
// cur ink3 · whole number ink (ink4 at 0)
export const AmountText = ({ cur, amt, size = 48 }) => (
  <Text style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
    <Text style={{ color: C.ink3, fontSize: Math.round(size * 0.44), fontWeight: '600' }}>{cur}</Text>
    <Text style={{ color: amt > 0 ? C.ink : C.ink4, fontSize: size, fontWeight: '700', letterSpacing: -1 }}>{fmt(amt)}</Text>
  </Text>
);

// -------------------------------------------------- shared amount sheet ----
// prototype shPad: amount (cur 17 / int 38 / dec 21) · 46px keys · action row
// actions: [{ label, color, bg, flex, onPress(v) }] — 54px tall, radius 16
export function AmountSheet({ visible, title, sub, cur = '', initial = 0, onClose, actions, children }) {
  const [amt, setAmt] = useState(initial);
  useEffect(() => { if (visible) setAmt(initial); }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} sub={sub}>
      {typeof children === 'function' ? children(amt) : children}
      <View style={{ marginTop: 14, marginBottom: 4 }}>
        <Text style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={{ color: C.ink3, fontSize: 17, fontWeight: '600' }}>{cur}</Text>
          <Text style={{ color: amt > 0 ? C.ink : C.ink4, fontSize: 38, fontWeight: '700', letterSpacing: -1 }}>{fmt(amt)}</Text>
        </Text>
      </View>
      <KeyPad keyH={46} radius={14} onKey={(k) => setAmt((a) => padAdvance(a, k))} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {actions.map((a, i) => (
          <Pressable
            key={i}
            onPress={() => { buzz(); a.onPress(amt); }}
            style={({ pressed }) => [
              u.sheetAct,
              { flex: a.flex || 1, backgroundColor: a.bg || C.fill },
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.8 },
            ]}
          >
            <Text style={{ color: a.color || C.ink, fontSize: 16, fontWeight: '700' }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

// ================================================================= styles ==
const u = StyleSheet.create({
  micro: { color: C.ink3, fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },

  field: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
    color: C.ink, fontSize: 15, paddingVertical: 10, paddingHorizontal: 0, marginTop: 8,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: C.sheet, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 8, maxHeight: '88%' },
  handle: { paddingBottom: 4 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line2, marginBottom: 14 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sheetTitle: { color: C.ink, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  sheetSub: { color: C.ink3, fontSize: 11, fontVariant: ['tabular-nums'] },

  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.33%', alignItems: 'center', justifyContent: 'center' },
  keyPress: { backgroundColor: C.fillSel, transform: [{ scale: 0.94 }] },
  keyText: { color: C.ink, fontSize: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },

  sheetAct: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
