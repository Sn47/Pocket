# Prompt: Redesign "Pocket" — the least-touch finance app

Copy everything below into Claude.

---

You are a world-class mobile product designer. Redesign **Pocket**, a React Native (Expo) personal finance app, into the most minimal, lowest-friction finance tracker possible — while making it visually beautiful.

## The one metric that matters
**Touches to complete an action.** Every screen, control, and flow must be justified by this. Logging an expense must never exceed: type amount → one tap. Anything that adds a touch must earn it.

## Design language
- Pure black background (#000), OLED-friendly. One accent per meaning: green #30D158 = money in, red #FF453A = money out, purple #BF5AF2 = invested. Nothing else colored.
- No labels where a symbol works. Use emojis and glyphs as the primary visual vocabulary:
  - Categories are emoji-only chips: 🍔 🚕 🛒 💡 🛍 🎮 💊 💼 🎁 — no text under them. Tap = select. Long-press reveals the name.
  - Actions are signs, not words: **−** spent, **＋** got, **⇆** transfer, **◎** goal, **↗** invest, **⌫** delete.
  - Status at a glance: 🔥 over budget, ✓ goal reached, ⏰ due today, 🔁 recurring.
- Typography does the design: one huge tabular-nums balance, tiny uppercase micro-labels, generous whitespace. No cards-within-cards, no borders where spacing suffices, no headers that repeat what's obvious.

## Interaction rules
1. **Zero-navigation logging.** The keypad is the home screen, always live. No FAB, no "add" screen.
2. **Two giant thumb buttons** (− and ＋) save instantly. Color floods the button on press as haptic-visual confirmation; balance animates.
3. **Everything is undoable, nothing is confirmed.** Destructive taps happen immediately with a 3-second UNDO pill. No "Are you sure?" dialogs anywhere (except full data wipe).
4. **One gesture per intent:** tap = act, long-press = delete, swipe row = reveal nothing (no hidden gestures beyond these two).
5. **Progressive disclosure.** Budgets, goals, debts, investments, charts exist but never intrude: collapse them into glanceable one-line rows — emoji + number + micro progress bar. Detail appears only on tap, in a bottom sheet, never a new screen.
6. **Smart defaults kill touches:** last-used category pre-selected, quick-amount chips from the user's own most frequent amounts, auto-tagging rules from notes, recurring entries that log themselves.

## What to deliver
1. A screen-by-screen spec (Log, Plan, Grow, More) with exact layout order, spacing rhythm, and which emoji/glyph replaces which label.
2. Touch-count table: every core action (log expense, log income, transfer, pay debt, add to goal, set budget) with its touch count — each must be ≤ 3 touches after amount entry.
3. The full React Native StyleSheet + component tree changes needed, consistent with an existing codebase using: StoreProvider context, bottom-sheet pattern, cents-based keypad (`padAdvance`), and a toast/undo system.
4. Micro-interactions: press-scale values, flash animation on save, haptic points.

## Hard constraints
- Dark only. No gradients, no shadows, no illustrations, no onboarding.
- Emoji are functional (identification), never decorative confetti.
- Every number is tabular-nums. Currency symbol is small and muted.
- Nothing requires more than one thumb.

Question every element: "does this earn its touch?" If not, delete it.
