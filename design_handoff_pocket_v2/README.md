# Handoff: Pocket v2 — Least-Touch Redesign

## Overview
A ground-up redesign of Pocket (React Native / Expo personal finance tracker) optimized for one metric: **touches to complete an action**. The keypad is the home screen; logging an expense is *type amount → tap −*. Everything secondary is hidden until relevant or collapsed into one-line glance rows that open bottom sheets.

## About the Design Files
The bundled files are **design references created in HTML** (`Pocket Redesign v2.dc.html` is an interactive prototype rendered in a phone frame; `ios-frame.jsx` and `support.js` are its runtime scaffolding). They are NOT production code. The task is to **recreate this design in the existing React Native (Expo) codebase** — `app/src/` with its `StoreProvider` context (`store.js`), cents-based keypad (`padAdvance` in `ui.js`), `Sheet`/`AmountSheet` bottom-sheet pattern, and the toast/undo system already in `App.js`/`store.js`. Reuse those primitives; restyle and restructure per this spec.

## Fidelity
**High-fidelity.** Colors, typography, spacing, sizes and copy below are final. Recreate pixel-perfectly.

## Design Tokens
Colors (only these — nothing else is colored):
- `bg: #000000` (pure black, OLED)
- `ink: #F5F5F7` (primary text), `ink2: #98989F` (secondary), `ink3: #5F5F67` (micro-labels), `ink4: #3A3A40` (ghost)
- `pos: #30D158` = money in · `neg: #FF453A` = money out · `inv: #BF5AF2` = invested
- Soft fills: `rgba(255,69,58,0.15)`, `rgba(48,209,88,0.15)`, `rgba(255,255,255,0.06)` (neutral), `rgba(255,255,255,0.1)` (selected)
- Sheet surface: `#141418`; toast surface: `#1C1C21`; hairline: `rgba(255,255,255,0.06–0.08)`
- Chart grays (donut): `#F5F5F7 #B9B9C0 #8E8E93 #6C6C72 #515157 #3A3A40 #2A2A2E`

Typography (system font / SF Pro): every number `fontVariant: ['tabular-nums']`. Micro-labels 9–10px / 700 / letterSpacing 1.8–2.5 / uppercase / ink3-ink4. Balance 52px/700/ls −1.5 with currency 18px/600 ink3 and decimals 24px/600 ink3. Amount entry 48px/700. Row titles 14–14.5px/500–600. Currency symbol always small + muted.

Spacing rhythm: screen padding 20px; section gaps 22–26px; row padding 11–14px vertical; hairline dividers only where spacing isn't enough. Radii: keys 16, chips 14, action buttons 22, sheet top 26, pills 999. Hit targets ≥ 44px.

Hard rules: dark only, no gradients, no shadows, no cards-within-cards. Emoji are functional identifiers, never decoration.

## Category emoji vocabulary
Spent: 🍔 Food · 🚕 Travel · 🛒 Groceries · 💡 Bills · 🛍 Shopping · 🎮 Fun · 💊 Health · ✱ Other
Got: 💼 Salary · 🧾 Freelance · 🎁 Gift · ↩ Refund · ✱ Other
Glyphs: − spent · ＋ got · ⇆ transfer · ◎ goal · ↗ invest · ⌫ delete · ◷ history · 🔥 over budget · ✓ done/confirm · ⏰ due · 🔁 recurring

## Screens / Views

### 1. Log (home, tab 1 ＋)
Vertical flex column, full height; balance pinned top, entry stack anchored to the BOTTOM (thumb zone) via `justifyContent` spacer (`marginTop: 'auto'` on the amount row).
Order top→bottom:
1. Header row: `POCKET` (10px/700/ls2 ink3) — right: account pills (`CASH` `BANK`, 11px/700/ls1; selected = ink, others = ink4; tap switches) + `◷` history glyph (15px ink3).
2. Balance block, centered, marginTop 26: `BALANCE` micro-label (9px/700/ls2.5 ink4, marginBottom 10), then `Rs` 18px ink3 + integer 52px/700 ink + `.dd` 24px ink3. Balance color flashes neg/pos/inv for 500ms on save and counts (tween ~450ms ease-out) to the new value.
3. *(auto spacer)*
4. Amount display, centered, height 56: `Rs` 21px + typed amount 48px/700 (ink when >0, ink4 when 0) + decimals 26px. When amount > 0 an `↗` invest chip (40×40, 1.5px `rgba(191,90,242,0.5)` border, purple glyph) appears beside it — tap = save as invest instantly.
5. Quick-amount chips — visible ONLY when amount == 0. 4 chips from the user's most frequent spent amounts (mode of `entries` amounts, top 4, ascending). Pill: 9px×14px padding, `rgba(255,255,255,0.06)` bg, 13px/600 ink2. Tap sets amount.
6. Emoji category row — visible ONLY when amount > 0. Horizontal scroll: 8 spent chips, 1px divider, 5 got chips. Chip 44×56, column: emoji 21px; if budgeted a 20×2px micro bar (green, red when over); when selected also the amount left (8.5px/700, ink3, red if negative). Selected = `rgba(255,255,255,0.1)` bg + inset 1.5px ink ring. Tap selects; **long-press (450ms) reveals the name** in a floating pill. Last-used category per type is pre-selected.
7. Note field — visible ONLY when amount > 0. Borderless, centered, 14px, hairline bottom, placeholder `note`. Auto-tag rules apply (keyword in note → category+type, e.g. "swiggy" → Food/spent).
8. Keypad: 3-column grid, keys `1–9, 00, 0, ⌫`, 52px tall, 24px/500 ink (`00`/`⌫` 19px ink3), radius 16. Press: bg `rgba(255,255,255,0.1)` + scale 0.94. Uses existing `padAdvance` cents logic.
9. Action row (marginTop 10, opacity 0.35 when amount == 0): `[ − flex1 ] [ ⇆ 64px ] [ ＋ flex1 ]`, all 68px tall, radius 22. − : `rgba(255,69,58,0.15)` bg, glyph 32px/700 #FF453A. ＋ mirror in green. **Press state floods solid accent with black glyph** + scale 0.97 (haptic-visual confirm). ⇆ neutral fill, 22px glyph.

Saving: pushes entry (cents, `acc: sel`), resets amount+note, keeps category as last-used, fires toast `−Rs420.00  🍔` (undoable 3s) — or `🔥 🍔 over budget` if the category's monthly spend now exceeds its budget. Haptics: light impact on every key/chip, medium on save.

Round-up sweep (on save of spent, if enabled): change up to the next 10 (`(1000 − amt%1000)%1000` cents) is added to the nearest-to-done incomplete goal; overflow flows to the next-nearest. Toast gains a tiny `◎ +6` tag. No other UI.

History: NOT on the home screen. `◷` opens a bottom sheet listing recent 30 entries grouped by day (`TODAY / YESTERDAY / Wed, Aug 26` micro-labels): emoji 20px · note+time 12px ink3 · amount right-aligned (spent ink, got green `+`, invest purple `↗`, transfer ink3 `⇆`). Tap row = edit sheet; long-press = instant delete + UNDO toast.

### 2. Plan (tab 2 ▤)
`PLAN` micro-label header. Then:
- **Due strip** (only when a non-auto recurring is due): `⏰ · name · ±amount · [✓ 44×44 green-soft] [✕ 44×44 neutral]`. ✓ logs it now (1 touch), ✕ skips the occurrence.
- `BUDGETS · AUGUST`: one row per spent category (except Other): emoji 20px · flex micro progress bar (3px, green / red when over) · `spent / limit` 12.5px tabular right (96px) · 🔥 flag when over. Tap row → budget sheet (keypad + `set`; 0 removes). Footer hairline row: `LEFT THIS MONTH` + total (green/red).
- `RECURRING`: rows `🔁 · name (+" · auto") · in Nd · ±amount`. Tap → recurring sheet: info line + `[✓ log now] [skip once] [⌫]`.
Plan tab glyph shows a 6px red dot when something is due.

### 3. Grow (tab 3 ◎)
`GROW` header, three groups:
- `◎ GOALS`: rows name · `saved / target` · ✓ (green) when reached, 3px green progress bar under. Tap → goal sheet: keypad + `[−]` (flex1 neutral) `[＋ add]` (flex2 green). `＋ goal` ghost row → name + target keypad sheet.
- `DEBT`: rows name · `~N mo` payoff ETA (amortization with monthly rate) · `remaining left` red · red progress bar (paid fraction). Tap → keypad + `pay` (green). `＋ debt` ghost row.
- `↗ INVESTED`: rows ↗ purple · name · current value · `±x.x%` (green/red). Tap → keypad + `set value` (purple).
Footer hairline row: `NET WORTH` = cash + holdings value − debt remaining.

### 4. More (tab 4 ≡)
`MORE` header. Glance rows (emoji/glyph 28px col · name 14px · optional 64×16 sparkline · value right), hairline separated; each opens a bottom sheet, never a screen:
- `∿ Cash` — green sparkline (last 30 days) → sheet: full line chart (90 days, `#30D158`, area fill 12% opacity).
- `◆ Net worth` — gray sparkline → sheet: purple line chart.
- `◔ Where it goes` — value = top category emoji + % → sheet: 150px donut (22px stroke) in the gray ramp + legend rows (emoji · name · mini bar · % · amount).
- `▥ Months` — value `−spent +got` → sheet: 6 months of paired 9px bars (red/green).
- `％ Saved this month` — savings-rate %, green (red if negative). No sheet.
SETTINGS: `◎ Round-up sweeps` (on/off, tap toggles) · `〰 Haptics` (on/off) · currency row (tap cycles Rs → ₹ → $ → €) · `⇪ Backup JSON` · `⇪ Transactions CSV` · `⌫ Erase everything` (red).
Footer: `All data stays on this phone.`

### Tab bar
4 glyph-only buttons (no labels): `＋ ▤ ◎ ≡`, 44px targets, 18–20px glyphs, active ink / inactive ink3, hairline top border, black bg.

## Touch-count table (after amount entry where applicable)
| Action | Touches |
|---|---|
| Log expense | 1 (−) · +1 optional category |
| Log income | 1 (＋) |
| Invest | 1 (↗) |
| Transfer | 2 (⇆ → destination account; picking destination saves) |
| Log due recurring | 1 (✓ on Plan strip) |
| Set budget | 2 (row → set) |
| Add to goal | 2 (row → ＋) |
| Pay debt | 2 (row → pay) |
| Update holding value | 2 (row → set value) |
| Delete anything | 1 (long-press) + optional 1 (UNDO) |

## Interactions & Behavior
- **Zero confirmation dialogs** except "Erase everything". Every destructive/creative action commits instantly with a 3s toast; `UNDO` restores the pre-mutation snapshot (existing `update(fn, msg, undoable)` + `undo()` in store.js already do this — keep them).
- Gestures: tap = act, long-press (450ms, `delayLongPress: 350–450`) = delete (rows) / reveal name (emoji chips). Nothing else.
- Bottom sheets: existing `Sheet` component; slide-up 260ms `cubic-bezier(0.32, 0.72, 0, 1)`, backdrop `rgba(0,0,0,0.65)` fade 200ms. One shared amount-sheet pattern (title · context line · keypad · action buttons) reused for budget/goal/debt/holding/transfer/edit/new-goal/new-debt.
- Progressive disclosure on Log: quick chips ↔ (emoji chips + note + ↗) swap on `amount > 0`.
- Smart defaults: last-used category per type pre-selected (`data.last = {spent, got}`); quick amounts computed from entry frequency; auto-tag rules; auto-log recurring on open (existing `processDue`).

## Micro-interactions (exact values)
- Key press: scale 0.94, bg `rgba(255,255,255,0.1)`, 60ms.
- Emoji chip press: scale 0.90, 80ms.
- −/＋ press: scale 0.97 + solid flood (#FF453A / #30D158) with black glyph, 80ms.
- Save: balance color flash 500ms + count-up tween 450ms cubic ease-out; toast slides up 180ms.
- Progress bars animate width 400ms on change.
- Haptics (expo-haptics): Light on keys/chips/tabs, Medium on save/undo, Success notification on goal reached. Gate all behind the `buzz` setting.

## State Management
Extend the existing store shape with: `last: {spent, got}` (last-used categories), `sweep: bool`, `buzz: bool`. Everything else (entries, accounts, budgets, goals, debts, holdings, recurring, rules, cur) already exists in `store.js`. New derived values: quick amounts (frequency of spent amounts), per-category month spend (budget bars/flags), nearest-to-done goal (sweeps).

## Component tree changes (vs current codebase)
- `App.js`: tab bar → glyph-only + red due-dot on Plan; keep toast (restyle: green UNDO, pill).
- `LogScreen.js`: remove hero card, account balance chips, seg control, text chips, inline Recent, transfer link → implement layout above; Recent moves to a sheet.
- `PlanScreen.js`: cards → flat sections; budgets become emoji+bar rows; Due strip at top; drop "Next 30 days" card (merged into recurring rows' `in Nd`).
- `GrowScreen.js`: drop StatGrid; goals/debts/holdings become glance rows + sheets; investment inline form → sheet.
- `MoreScreen.js`: all charts collapse to glance rows opening sheets; categories/rules management can stay in sheets or be cut (v2 cut them); PIN kept in data model, no lock screen in v2.
- `ui.js`: keep `Sheet`, `KeyPad`, `padAdvance`, `AmountText` (restyle sizes/colors per tokens); delete `Card`, `Chip`, `Seg`, `StatGrid` usage on redesigned screens.

## Assets
None — emoji and unicode glyphs only. System font. No images, no icons libraries.

## Files
- `Pocket Redesign v2.dc.html` — the interactive hi-fi prototype (final design). Open in a browser; `support.js` + `ios-frame.jsx` must sit beside it.
- `ios-frame.jsx`, `support.js` — prototype runtime only, not part of the design.
- `screenshots/` — reference captures: `01-log-rest` (keypad home, amount 0), `02-log-amount-typed` (chips + note + ↗ revealed), `03-history-sheet` (◷), `04-plan` (budgets + 🔥), `05-grow` (goals/debt/invested), `06-more` (glance rows + settings).
