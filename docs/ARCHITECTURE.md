# NOVA Architecture

This document explains how NOVA is organized today and how the backend will slot in when v1.1 lands.

---

## Overview

NOVA is a **mobile-first, local-first personal finance app** built on **TanStack Start v1** (React 19 + Vite 7). Every feature in v1.0 runs entirely on the client — state lives in React Context + `localStorage` — so the app works offline and can be shipped as a static PWA today.

The codebase is deliberately structured so that swapping `localStorage` for a real backend in v1.1 requires touching **one module** (`src/lib/nova-store.tsx`), not the entire app.

---

## Project Structure

```text
nova/
├── docs/                     # Project documentation
├── public/                   # Static assets
├── src/
│   ├── components/
│   │   ├── nova/             # App-specific components (AppShell, Empty, Skeleton, etc.)
│   │   └── ui/               # shadcn primitives (button, dialog, etc.)
│   ├── hooks/                # Reusable hooks (use-mobile, etc.)
│   ├── lib/                  # Domain logic + providers
│   │   ├── nova-store.tsx    # Global state (accounts, transactions, goals…)
│   │   ├── currency.tsx      # Currency + FX provider
│   │   ├── theme.tsx         # Light / dark / system
│   │   ├── i18n.tsx          # Localization + accent presets
│   │   ├── hide-balance.ts   # Balance masking helper
│   │   ├── insights.ts       # Forecast + NLP helpers
│   │   └── nova-data.ts      # Seed data
│   ├── routes/               # File-based routes (TanStack Start)
│   │   ├── __root.tsx        # App shell, providers, metadata
│   │   ├── index.tsx         # Dashboard
│   │   ├── wallet.tsx
│   │   ├── add.tsx
│   │   ├── insights.tsx
│   │   ├── settings.tsx
│   │   └── …                 # calendar, goals, networth, ai, scan, etc.
│   ├── routeTree.gen.ts      # Auto-generated — do not edit
│   ├── router.tsx
│   ├── start.ts              # Client entry
│   ├── server.ts             # SSR entry
│   └── styles.css            # Tailwind v4 + design tokens
├── package.json
└── vite.config.ts
```

---

## State Management

NOVA uses **React Context + `useReducer`** rather than an external store (Zustand, Redux). The rationale:

- The domain is small (~10 entities) and mutations are simple.
- Every write is durable via `localStorage` — the reducer serializes on each dispatch.
- Swapping the persistence layer for Supabase in v1.1 means changing the reducer's side effects, not the API components consume.

**Providers (composed in `__root.tsx`):**

```text
<ThemeProvider>
  <I18nProvider>
    <CurrencyProvider>
      <NovaProvider>         ← accounts, transactions, goals, budgets…
        <ConfirmProvider>    ← shared confirmation dialog
          <RecurringAdvancer />
          <Outlet />
```

Consumers use dedicated hooks: `useNova()`, `useCurrency()`, `useTheme()`, `useI18n()`, `useConfirm()`.

---

## Routing

File-based routing via **TanStack Router**. Every `.tsx` file under `src/routes/` becomes a route; `routeTree.gen.ts` is regenerated automatically. Conventions:

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `wallet.tsx` | `/wallet` |
| `settings.tsx` | `/settings` |
| `__root.tsx` | Global app shell (`<Outlet />`) |

Each route defines its own `head()` for title / meta / OpenGraph. The bottom tab bar lives in `AppShell` and is rendered inside `__root.tsx`.

---

## Theme System

- Design tokens are declared in `src/styles.css` using **OKLCH** and semantic CSS variables (`--background`, `--foreground`, `--primary`, …).
- Light and dark themes swap the same variables — components never hardcode colors.
- `ThemeProvider` writes `data-theme` on `<html>` and listens to `prefers-color-scheme` for the `system` option.
- Accent presets live in `i18n.tsx` (they piggyback on the preferences store) and inject `--primary` at runtime via `PreferencesApplier`.

---

## Localization

`src/lib/i18n.tsx` exposes a `useI18n()` hook returning `t(key)`. Translations are static objects — 5 languages ship in v1.0. Adding a language means adding one entry to the dictionary and one option to the picker.

---

## Storage

**v1.0 — Local:**

- Every provider persists to `localStorage` under a namespaced key (`nova.store.v3`, `nova.currency.v1`, `nova.theme.v1`, `nova.i18n.v1`, `nova.onboarded.v1`).
- All reads are SSR-safe (guarded with `typeof window` checks) and gated on a `useHydrated()` boundary in `__root.tsx` to avoid hydration mismatches.
- Export / import is a plain JSON dump of the store keys — used for backups in Settings.

**v1.1 — Cloud (planned):**

- `localStorage` becomes an offline cache.
- Writes queue and flush to Supabase when online.
- Conflict resolution: last-writer-wins per row, keyed on `updated_at`.

---

## Future Backend

### Database Plan (Supabase / Postgres)

All tables live in the `public` schema, protected by RLS, with explicit `GRANT`s to `authenticated`.

```text
profiles         (id → auth.users, display_name, currency, locale)
accounts         (id, user_id, name, type, balance, currency)
transactions     (id, user_id, account_id, amount, category, date, notes)
categories       (id, user_id, name, icon, color, kind)
goals            (id, user_id, name, target, current, deadline)
budgets          (id, user_id, category, monthly_limit)
liabilities      (id, user_id, name, balance, interest_rate)
subscriptions    (id, user_id, name, amount, cadence, next_date)
recurring        (id, user_id, template_json, cadence, next_date)
automation_rules (id, user_id, trigger, action, enabled)
user_roles       (id, user_id, role)          — separate table, never on profiles
```

Every table:

1. `CREATE TABLE public.<name>(...)`
2. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;`
3. `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;`
4. `CREATE POLICY "<name> owner"` on `auth.uid() = user_id`.

### API Layer

- **Reads/writes** from components: TanStack `createServerFn` in `src/lib/*.functions.ts`, protected by `requireSupabaseAuth`.
- **Webhooks / cron / public endpoints**: server routes under `src/routes/api/public/*` with signature verification.
- **Realtime**: Supabase channels for shared wallets (v1.3).

### Authentication Flow

```text
┌─ /onboarding ─┐    ┌─ /auth ─┐    ┌─ _authenticated/* ─┐
│  first run    │ →  │ sign in │ →  │ dashboard, wallet, │
│  choose lang  │    │ or up   │    │ settings, …        │
└───────────────┘    └─────────┘    └────────────────────┘
```

- Managed Supabase auth (email/password, Google, Apple).
- `_authenticated` layout route gates every private page; unauth users redirect to `/auth`.
- Session token attached to server-fn calls via a client middleware in `src/start.ts`.
- Biometrics unlock the app locally on top of the session (does not replace auth).

---

## Design Principles

1. **Local-first.** The app must work offline. Cloud is an enhancement, not a dependency.
2. **Semantic tokens only.** No hardcoded colors in components; theme is the single source of truth.
3. **One store, many hooks.** Keep the reducer boring; expose ergonomic hooks.
4. **Route files own their metadata.** Each route sets its own `head()`.
5. **Confirm destructive actions.** Never delete without `useConfirm()`.