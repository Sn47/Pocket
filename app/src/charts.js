import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, GRAYS } from './theme';
import { emojiFor } from './util';

const W = 320, H = 110;

const pathFor = (values, w, h, pad = 4) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
  return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
};

// ------------------------------------------------------------- line chart --
export function LineChart({ values, color = C.pos, height = 120 }) {
  if (!values || values.length < 2) return null;
  const line = pathFor(values, W, H);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Path d={line + ` L${W} ${H} L0 ${H} Z`} fill={color} opacity={0.12} />
      <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// -------------------------------------------------------- 64×16 sparkline --
export function Sparkline({ values, color = C.ink3 }) {
  if (!values || values.length < 2) return <View style={{ width: 64, height: 16 }} />;
  return (
    <Svg width={64} height={16} viewBox="0 0 64 16" preserveAspectRatio="none">
      <Path d={pathFor(values, 64, 16, 1.5)} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// ------------------------------------------------------------------ donut --
export function Donut({ slices, size = 150, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.v, 0) || 1;
  let acc = 0;
  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => {
        const frac = s.v / total;
        const el = (
          <Circle
            key={i}
            cx={cx} cy={cx} r={r}
            stroke={s.c} strokeWidth={stroke} fill="none"
            strokeDasharray={`${Math.max(0, frac * circ - 2.5)} ${circ}`}
            strokeDashoffset={-acc * circ}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        );
        acc += frac;
        return el;
      })}
    </Svg>
  );
}

// ------------------------------------- labeled comparison bars (insights) --
export function Bars({ items, height = 96 }) {
  const max = Math.max(...items.map((x) => x.v), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, height }}>
      {items.map((x, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6 }}>
          <Text style={{ color: x.c, fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{x.top || ''}</Text>
          <View style={{ width: '100%', maxWidth: 38, height: Math.max(3, (x.v / max) * (height - 40)), backgroundColor: x.c, borderRadius: 4, opacity: 0.9 }} />
          <Text style={{ color: C.ink3, fontSize: 10, textAlign: 'center' }}>{x.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ------------------------------- cumulative pace: this vs last month curves --
export function PaceChart({ cur, prev, dim, height = 80 }) {
  const W2 = 320, H2 = 80;
  const max = Math.max(cur[cur.length - 1] || 0, prev[prev.length - 1] || 0, 1);
  const path = (arr) => 'M' + arr.map((v, i) => ((i / dim) * W2).toFixed(1) + ' ' + (H2 - 4 - (v / max) * (H2 - 8)).toFixed(1)).join(' L');
  const curEnd = ((cur.length - 1) / dim) * W2;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W2} ${H2}`} preserveAspectRatio="none">
      <Path d={path(prev)} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d={path(cur) + ` L${curEnd.toFixed(1)} ${H2} L0 ${H2} Z`} fill={C.neg} opacity={0.08} />
      <Path d={path(cur)} stroke={C.neg} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// ------------------- paired bars (spent/got), tappable months (12-mo year) --
export function MonthBars({ months, onPick }) {
  const max = Math.max(...months.map((m) => Math.max(m.spent, m.got)), 1);
  const w = months.length > 8 ? 6 : 9;
  const Wrap = onPick ? Pressable : View;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 132, marginTop: 6 }}>
      {months.map((m, i) => (
        <Wrap key={i} onPress={onPick ? () => onPick(m) : undefined} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 104 }}>
            <View style={{ width: w, borderRadius: 3, height: Math.max(3, (m.spent / max) * 100), backgroundColor: C.neg }} />
            <View style={{ width: w, borderRadius: 3, height: Math.max(3, (m.got / max) * 100), backgroundColor: C.pos }} />
          </View>
          <Text style={{ color: C.ink3, fontSize: 9, marginTop: 6 }}>{m.label}</Text>
        </Wrap>
      ))}
    </View>
  );
}

// ------------------------------------- donut legend: emoji · bar · % · amt --
export function CatLegend({ cats, total, money }) {
  return (
    <View style={{ marginTop: 14 }}>
      {cats.map((c, i) => (
        <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
          <Text style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{emojiFor(c.name)}</Text>
          <Text style={{ color: C.ink, fontSize: 13, width: 82 }} numberOfLines={1}>{c.name}</Text>
          <View style={{ flex: 1, height: 3, backgroundColor: C.line2, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: (total ? (c.v / total) * 100 : 0) + '%', height: 3, backgroundColor: GRAYS[i % GRAYS.length], borderRadius: 2 }} />
          </View>
          <Text style={{ color: C.ink3, fontSize: 11.5, width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {total ? ((c.v / total) * 100).toFixed(0) : 0}%
          </Text>
          <Text style={{ color: C.ink2, fontSize: 12, fontVariant: ['tabular-nums'] }}>{money(c.v)}</Text>
        </View>
      ))}
    </View>
  );
}
