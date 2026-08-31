# Pocket v2.1 (React Native / Expo)

Least-touch finance tracker with a local, rule-based advisor. Built to `design_handoff_pocket_v2` (final), the prototype being the source of truth.

## Tabs — ＋ ▤ ✦ ◎ ≡

- **＋ Log** — keypad home. Balance (flash + count-up), tappable 7-day strip → day sheet, ambient layer when idle (last-month report card, surplus-to-goal offer, SAFE TODAY, spend pace + 🌱 streak, bill radar, after-9pm summary). Pinned 1-tap logs + learned quick amounts. Big-purchase mirror ("= 2.3 days of income"), − deepens red when a save breaks the budget. ◷ history: tap = edit, hold = delete, tap amount = repeat, hold a day = repeat the day. Hold ⌫ clears.
- **▤ Plan** — due strip (✓ log · ✕ skip · hold ✕ = snooze to tomorrow), auto-detected recurring suggestions, budgets with ↑↓ pace trends and 🔥 flags, recurring list, ＋ recurring.
- **✦ Advisor** — money-health score /100 (savings 30 · runway 30 · debt 25 · discipline 15) with factor sheet + biggest lever; THIS MONTH pulse (kept %, spend-pace curve vs last month, biggest pull, entries); up to 15 ranked insights with EVIDENCE, comparison bars and one-tap pre-filled actions; hold to mute 30d. Red dot on ✦ when a red insight exists.
- **◎ Grow** — goals (± sheets, round-up sweeps land here), debt payoff, portfolio header (value · gain · /mo pace · allocation bar), holdings with share-of-portfolio, ⌫ sell / ＋ add / set value, ＋ investment.
- **≡ More** — glance rows with sparklines → chart sheets (cash 90d, net worth, monthly donut, 12-month year view with tap-through), sweeps, haptics, PIN lock (4-digit dot pad), currency, backup/CSV, restore sample data, erase.

Round-up sweeps, salary sweep offer (income ≥ 10,000 → 5s "sweep 20%" pill), PIN lock on open, undo on everything. All data on-device.

## Run

```bash
cd app
npm install
npx expo start -c
```

Web deploy: pushed to GitHub → Vercel builds `expo export --platform web` (see /vercel.json) and serves an installable PWA.
