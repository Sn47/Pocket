# Pocket v2 (React Native)

Least-touch finance tracker, built to the `design_handoff_pocket_v2` brief. Emoji and glyphs replace labels; every action commits instantly with a 3s UNDO — no confirmations.

## Tabs (glyph-only)

- **＋ Log** — keypad is the home screen. Type amount → tap **−** (spent) or **＋** (got). Optional: emoji category chip (last-used pre-selected, budget micro-bars), note (auto-tag rules), **↗** invests instantly, **⇆** transfers (pick destination = saved). Quick-amount chips learn your most frequent amounts. **◷** opens history (tap = edit, hold = delete).
- **▤ Plan** — ⏰ due strip (✓ logs in one touch, ✕ skips), emoji budget rows with 🔥 over-flags (tap = set limit), 🔁 recurring.
- **◎ Grow** — goals (tap = ± money, ✓ when reached), debt (tap = pay, ~months to free), ↗ holdings (tap = update value), net worth footer.
- **≡ More** — glance rows with sparklines (cash, net worth, where it goes, months, savings rate) opening chart sheets; round-up sweeps, haptics, currency, accounts, categories, rules, PIN, backup/import, erase.

Responsive: keypad, action buttons and type scale with screen size; the entry stack is pinned to the thumb zone on any phone height.

## Run

```bash
cd app
npm install
npx expo start -c
```

Scan the QR with Expo Go. (`-c` clears Metro's cache — use it after pulling changes.)

## Moving data from the old web app

Old PWA: Charts → Export backup (JSON) → copy. Here: ≡ → Import backup → paste.
