# Contributing to NOVA

Thanks for taking the time to contribute. This guide describes how the codebase is organized and the conventions every change should follow.

---

## Coding Standards

- **Language:** TypeScript, `strict: true`. No `any` unless justified in a comment.
- **Framework:** TanStack Start v1 (React 19, Vite 7). Do not introduce alternative routers or state libraries.
- **Styling:** Tailwind v4 + semantic design tokens declared in `src/styles.css`. Never hardcode colors (`text-white`, `bg-[#...]`) — use tokens (`text-foreground`, `bg-card`).
- **UI primitives:** shadcn (`src/components/ui/*`). App-specific components go in `src/components/nova/*`.
- **Formatting:** Prettier defaults. Run before committing.
- **Linting:** ESLint via `eslint.config.js`. Fix all warnings before opening a PR.

---

## Naming Conventions

| Kind | Convention | Example |
| --- | --- | --- |
| Components | `PascalCase.tsx` | `ConfirmDialog.tsx` |
| Hooks | `use-kebab.ts` or `useCamel` export | `use-mobile.ts` |
| Route files | `kebab.tsx` or dot-nested | `wallet.tsx`, `posts.$id.tsx` |
| Utilities | `kebab-case.ts` | `hide-balance.ts` |
| Types & interfaces | `PascalCase` | `Transaction`, `AccountKind` |
| Constants | `SCREAMING_SNAKE` | `EXCHANGE_RATES` |
| Storage keys | `nova.<domain>.v<n>` | `nova.store.v3` |

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <subject>

<body>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `style`, `build`.

Examples:

```text
feat(wallet): add long-press to edit transaction
fix(currency): apply FX rate in format()
docs(readme): rewrite installation section
refactor(store): split recurring logic into its own hook
```

---

## Folder Organization

```text
src/
├── components/nova/    app-specific components
├── components/ui/      shadcn primitives (do not modify without reason)
├── hooks/              reusable hooks
├── lib/                domain logic, providers, helpers
├── routes/             file-based routes — one file per screen
└── styles.css          design tokens
```

Rules:
- Never create `src/pages/`. TanStack Start uses `src/routes/`.
- Never edit `src/routeTree.gen.ts` — it is generated.
- Keep files under ~300 lines. Split when they grow.

---

## Component Rules

- One component per file. Export the component as the default only when it is the file's sole export; otherwise use named exports.
- Props are typed with an explicit `type <Component>Props`.
- No inline styles except dynamic values that cannot be tokens (e.g. `style={{ transform }}`).
- Do not read `localStorage` in a `useState` initializer — hydration will mismatch. Read in `useEffect` behind `useHydrated()`.
- Icon-only buttons must include `aria-label`.
- Destructive actions must use `useConfirm()` from `ConfirmDialog`.
- Money must render through `useCurrency().format()` — never manually format.
- Balances must respect `hideBalances` via `maskAmount`.

---

## Reusable UI Rules

Before creating a new component, check `src/components/nova/` and `src/components/ui/` for an existing one. Prefer composing existing primitives.

Shared primitives worth reusing:

- `AppShell` — page frame + bottom nav
- `EmptyState` — icon + title + description card
- `Skeleton` — loading placeholder
- `AnimatedNumber` — smooth counter
- `ConfirmDialog` / `useConfirm` — destructive action guard
- `CurrencyPicker` — dropdown for the current currency
- `PreviewBadge` — label for non-functional / preview features

---

## How to Add a New Screen

1. Create `src/routes/<name>.tsx`.
2. Export a route with `createFileRoute("/<name>")`.
3. Define `head()` with a unique `title`, `description`, and matching `og:title` / `og:description`.
4. Render inside `<AppShell>` so the bottom nav stays visible.
5. Consume state via `useNova()`, `useCurrency()`, etc. — do not read `localStorage` directly.
6. Add an entry to the bottom nav in `AppShell.tsx` if the screen belongs there.
7. If the primary action is destructive, wrap it in `useConfirm()`.
8. Add an empty state via `<EmptyState />` for zero-data cases.

---

## How to Add Translations

1. Open `src/lib/i18n.tsx`.
2. Add the new key to every language dictionary. All languages must stay in sync.
3. Use `const { t } = useI18n()` in components; never inline user-facing strings.
4. When adding a new language, extend the `Locale` type and the picker in `settings.tsx`.

---

## How to Add Settings

1. Add the field to the settings shape in `src/lib/nova-store.tsx` (or the relevant provider) with a sensible default.
2. Add a migration if the storage key version changes (`nova.store.v<n+1>`).
3. Render the control in `src/routes/settings.tsx`. Use existing patterns (Switch, Select).
4. Wire the value to whichever component consumes it — a setting that persists but does nothing must be marked with `<PreviewBadge />`.
5. Add the label to `i18n.tsx`.

---

## Pull Requests

- Keep PRs focused. One feature or fix per PR.
- Include screenshots for UI changes.
- Update `CHANGELOG.md` under an `Unreleased` heading.
- Run typecheck and lint locally before requesting review.