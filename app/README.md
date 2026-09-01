# Pocket v3 (React Native / Expo)

Personal, bubble-first expense tracker — built to `design_handoff_pocket_v3`. Category-first logging: tap an emoji bubble, type on a large keypad. One balance + a 🏦 savings pot. No server; everything on-device.

## First run

3-step onboarding: your name + currency → income sources (become ＋ income categories and monthly recurring stubs) → top-3 spend picks (pre-order your bubbles). Editable later via ≡ → Name & income. Erase everything re-runs it.

## Tabs — ＋ ▤ ✦ ◎ ≡

- **＋ Log** — POCKET · NAME header, money-mood balance (tap to peek digits 10s), soft 7-day spend line → day sheet, one rotating pulse line (bill radar → 🌱 streak → kept % / goal nudge / safe-today / pace / fun lines). "what was it?" → **bubble cluster** sized & ordered by your 90-day habits + onboarding picks; tap a bubble → log sheet (big keypad, note, budget-left subline, red save). **MONEY IN** pill → income sheet with your personalized source chips; income auto-fills its recurring stub or becomes a monthly recurring. ◷ history: tap = edit, hold = delete, tap amount = repeat, hold a day = repeat the day.
- **▤ Plan** — due strip (✓ / ✕ / hold-✕ snooze), auto-detected recurring suggestions, budget rows with pace arrows and 🔥, ＋ budget (or create a whole new category with any emoji), recurring list, ＋ recurring.
- **✦ Advisor** — health score /100 with factor sheet & biggest lever, THIS MONTH pulse, up to 15 ranked evidence-backed insights with one-tap actions, personalized mindful line.
- **◎ Grow** — 🏦 savings pot (save/withdraw → →/← history entries), goals & debts with **✦ plan lines** ("put ~2,200/mo aside…") and **DUE chips** (3/6/12 mo) that recompute the plan (debt plans include interest), TOTAL DEBT, portfolio with allocation strip, NET WORTH = cash + savings + invested − debt.
- **≡ More** — glance rows with chart sheets, Name & income, sweeps, haptics, money-mood editor, feature toggles, PIN lock, currency, backup/CSV, restore sample data, erase.

## Run

```bash
cd app
npm install
npx expo start -c
```

APK: see /BUILD-APK.md. Web/PWA: pushed to GitHub → Vercel auto-deploys (installable, standalone).
