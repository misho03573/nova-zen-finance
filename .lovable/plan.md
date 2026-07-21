# NOVA · Production Readiness Audit

Goal: bring every existing feature to a fully functional, stable state. No new features. Fix in order of blast radius (crashes/data → correctness → polish).

## Findings checklist

### P0 — Runtime crashes / SSR

- [ ] **Hydration mismatch on `/` (dashboard)** — visible in runtime errors. The seed dates are computed at module load (`iso(daysAgo)`), so `monthlyTotals` yields different results when the SSR module was evaluated on a different day than the client. Also, `CurrencyProvider` and `NovaProvider` seed with defaults on the server but hydrate from `localStorage` on the client, so any component reading from them (Home, Wallet, Insights, etc.) can mismatch on first paint.
  - Fix: introduce a `useHydrated()` hook and gate all localStorage-derived / date-derived reads behind it, OR render the app tree only after hydration in `__root.tsx` (simpler, matches the client-only nature of a demo finance app). Prefer the latter — this app is entirely client-state, SSR gives it nothing.
- [ ] **`OnboardingGate` runs before hydration** — reads `localStorage` in an effect and calls `navigate({ to: "/onboarding" })` unconditionally on every route. This causes a redirect flash for onboarded users because SSR renders `/` first, then the effect navigates. Gate on `useHydrated()`.
- [ ] **`useReducer(reducer, seed)` on server** — seed is fine, but `dispatch({ type: "hydrate" })` in an effect causes a full re-render mid-hydration. After the client-only-render fix above this is moot.

### P1 — Broken / half-wired features

- [ ] **Settings → Face ID / Touch ID / Cloud sync / Notifications / Budget alerts** — toggles persist but do nothing. Either remove them or add a "Preview" badge so users know. Keep them (they persist) and label them "Preview" to be honest.
- [ ] **Settings → Auto-lock, PIN** — PIN is stored but never checked; there is no lock screen. Wire a simple client-side lock screen that gates the app when `pinEnabled` is true and the tab was inactive longer than `autoLockMinutes`. If out of scope for "no new features", label as Preview.
- [ ] **Settings → Hide balances** — persists but nothing reads it. Wire the flag into the balance display on Home + Wallet + NetWorth (blur `text-transparent` with `select-none` and a tap-to-reveal).
- [ ] **Home "Send" / "Request" quick actions** — both link to `/wallet` and do nothing there. Either remove them or route them to the Add screen with a preset intent. Simplest: remove to keep parity with existing features.
- [ ] **`QuickAction` `to` prop typed as a hard-coded union** — brittle; type as `LinkProps["to"]` so we don't fight the router.
- [ ] **`/scan`, `/import`, `/ai`, `/automation`, `/subscriptions`, `/networth`** — verify each route mounts, has a working back link, and its primary action wires to the store. Fix any dead buttons and missing empty states.
- [ ] **Currency FX rates unused** — `EXCHANGE_RATES` is defined but `format` never converts. Either (a) apply conversion on display (multiplying by the rate), or (b) delete the constant to avoid the illusion of multi-currency. Pick (a) — the feature was advertised.
- [ ] **`nova.onboarded.v1` never set** — check `onboarding.tsx` actually writes the flag on completion; otherwise the gate loops.

### P2 — Correctness / UX

- [ ] **Every localStorage read** must be SSR-safe. Audit `nova-store`, `currency`, `theme`, `i18n` — all currently do `typeof window` checks; verify after the client-only-render change.
- [ ] **`Toaster` position** — sonner defaults may collide with the bottom nav. Set `position="top-center"` in `__root.tsx`.
- [ ] **`AppShell` bottom nav** — verify all 5 tabs exist as routes and highlight the active tab correctly (Home / Wallet / Add / Insights / Settings — spot-check via replay).
- [ ] **`monthlyTotals` / `cashflowByRange`** — currently filter by `getMonth() === now.getMonth()`; that breaks across year boundaries. Compare `getFullYear()` too.
- [ ] **`formatTxDate`** — verify it uses the user's locale from `i18n` not `en-US` hardcoded.
- [ ] **Delete confirmation** — Wallet swipe-delete and account delete should confirm (currently instant).
- [ ] **Recurring "next date" not advanced** — when a recurring hits due, nothing rolls it forward. Add a check on app load that advances `nextDate` for any past-due recurring and records the transaction.
- [ ] **Goal ETA** — verify `estimateGoalETA` handles `monthly = 0` (Infinity → "—").
- [ ] **Budget alerts** — no visible warning UI when over budget. Add a red badge on the Insights budget list; keep behind `settings.budgetAlerts`.

### P3 — Polish / a11y / SEO

- [ ] Every route has a unique `head()` title + description (audit all 14).
- [ ] `og:image` only on leaf routes with a real image (Home). Currently none — leave omitted.
- [ ] Icon-only buttons all have `aria-label` (spot-check nav, close buttons, currency picker).
- [ ] Placeholder colors use `text-muted-foreground`, no `text-gray-*`.
- [ ] Confirm no `text-white` / `bg-black` hardcodes outside gradient cards.
- [ ] All `<Link>` components use typed `to` (no `<a href>` for internal navigation).

## Execution order

1. **SSR & hydration** — flip `<Outlet />` in `__root.tsx` to client-only mount; remove `useReducer` hydrate double-render; harden `OnboardingGate`.
2. **Store correctness** — year-safe date filters; recurring auto-advance; hide-balances flag; goal ETA guard.
3. **Currency FX** — apply exchange rate in `format`; verify all money displays.
4. **Settings honesty** — label non-functional toggles as "Preview" so nothing looks broken.
5. **Route-by-route walk** — Home → Wallet → Add → Insights → Calendar → Stats → Goals → Networth → Subscriptions → Automation → Scan → Import → AI → Onboarding → Settings. For each: mount, primary CTA, empty state, back link, `head()`.
6. **A11y + SEO sweep** — labels, titles, semantic tokens.

## Notes

- No new features. Anything ambiguous is either wired to existing store state or labeled "Preview".
- I'll commit after each module and share a short recap so you can spot-check.
- If a P1 item turns out to be new-feature territory (e.g. real biometrics), I'll leave it as "Preview" and note it here.
