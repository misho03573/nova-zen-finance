<div align="center">

# NOVA

**A premium, mobile-first personal finance app.**
Local-first. Offline capable. Beautifully dark.

[![Version](https://img.shields.io/badge/version-1.0.0-3B82F6?style=flat-square)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-10B981?style=flat-square)](#license)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-v1-FF4154?style=flat-square)](https://tanstack.com/start)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-8B5CF6?style=flat-square)](./CONTRIBUTING.md)

[Features](#features) • [Screenshots](#screenshots) • [Installation](#installation) • [Architecture](./docs/ARCHITECTURE.md) • [Native build](./docs/NATIVE_BUILD.md) • [Roadmap](./docs/ROADMAP.md) • [Changelog](./CHANGELOG.md)

</div>

---

## Overview

**NOVA** is a production-quality personal finance app inspired by Apple Wallet and Revolut. It tracks accounts, transactions, budgets, goals, subscriptions, and net worth — all with a polished dark interface, buttery animations, and thoughtful empty states.

Version 1.0 is fully **local-first**: every byte of your data lives in your browser. No account, no server, no telemetry. Version 1.1 will introduce optional cloud sync via Lovable Cloud.

---

## Features

### Core
- 📊 **Dashboard** — Net worth, monthly spending, and quick actions
- 💳 **Wallet** — Grouped transaction history with search and swipe-to-delete
- ➕ **Add Transaction** — Income, expense, and transfer flows
- 🎯 **Goals** — Track savings goals with ETA and progress bars
- 📈 **Statistics** — Weekly, monthly, and yearly analytics
- 📅 **Calendar** — Financial activity heatmap
- 💰 **Net Worth** — Assets and liabilities side by side

### Intelligence
- 🧠 **Insights** — Behavioral summaries and cash-flow forecast (7 / 30 / 90 days)
- 🤖 **AI Chat** — Rule-based financial assistant
- 📸 **Receipt Scanner** — Simulated OCR pipeline
- 🔍 **Natural-language search** — "coffee last month"

### Automation
- 🔁 **Recurring transactions** — Auto-advance on app load
- ⚡ **Automation rules** — Round-ups, savings sweeps
- 📆 **Subscriptions tracker** — Upcoming charges & totals
- 📥 **CSV Import** — Bring your bank statement in

### Personalization
- 🌓 **Theme** — Light, dark, or system
- 🎨 **Accent presets** — Six curated color pairs
- 💱 **Currency** — 10 currencies with real FX
- 🌍 **Localization** — 5 languages
- 🔒 **Privacy** — Hide-balance mode, PIN lock (preview)

### Developer Experience
- 🩺 **Diagnostics hub** — Build info, storage, error log, danger zone
- ♻️ **Backup** — Export / import your entire dataset as JSON
- 🧩 **Shared primitives** — `ConfirmDialog`, `EmptyState`, `AnimatedNumber`, `Skeleton`

---

## Screenshots

> _Screenshots coming soon. NOVA is best experienced in a mobile viewport (430×932)._

| Dashboard | Wallet | Add | Insights | Goals |
| :---: | :---: | :---: | :---: | :---: |
| _[dashboard.png]_ | _[wallet.png]_ | _[add.png]_ | _[insights.png]_ | _[goals.png]_ |

| Net Worth | Statistics | Calendar | Settings | Onboarding |
| :---: | :---: | :---: | :---: | :---: |
| _[networth.png]_ | _[stats.png]_ | _[calendar.png]_ | _[settings.png]_ | _[onboarding.png]_ |

---

## Installation

### Prerequisites

- **Node.js** ≥ 20
- **Bun** ≥ 1.1 _(recommended)_ or npm / pnpm

### Clone & install

```bash
git clone https://github.com/your-org/nova.git
cd nova
bun install
```

### Start the dev server

```bash
bun run dev
```

Open [http://localhost:8080](http://localhost:8080) and go through the onboarding.

---

## Development

```bash
bun run dev          # Vite dev server (HMR)
bun run build        # Production build
bun run build:dev    # Dev-mode build (unminified)
bun run preview      # Preview the production build
bun run build:native # Static bundle for the Capacitor native shell
bun run cap:sync     # build:native + cap sync
bun run lint         # ESLint
bun run format       # Prettier
```

### Environment

NOVA v1.0 requires **no environment variables**. Everything runs client-side against `localStorage`. Cloud sync (v1.1) will introduce a `.env` example.

### Coding conventions

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide (naming, commits, folder rules, adding screens, translations, settings).

---

## Project Structure

```text
nova/
├── docs/
│   ├── ROADMAP.md
│   └── ARCHITECTURE.md
├── public/
├── src/
│   ├── components/
│   │   ├── nova/          # App-specific components
│   │   └── ui/            # shadcn primitives
│   ├── hooks/
│   ├── lib/               # Providers & domain logic
│   ├── routes/            # File-based routes
│   ├── router.tsx
│   ├── start.ts
│   ├── server.ts
│   └── styles.css
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── package.json
```

Full details in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Roadmap

| Version | Focus | Status |
| --- | --- | --- |
| **1.0** | Core app, local-first | ✅ Released |
| **1.1** | Auth, cloud sync, biometrics | 🔜 Next |
| **1.2** | Real AI (OCR, assistant, forecasts) | ⏳ Planned |
| **1.3** | Shared wallets, family accounts | ⏳ Planned |
| **2.0** | Bank integrations, investments, wearables | 🌌 Vision |

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the full breakdown.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | **TanStack Start v1** (React 19, Vite 7) |
| Language | **TypeScript** (strict) |
| Styling | **Tailwind CSS v4** + OKLCH design tokens |
| UI Primitives | **shadcn/ui** + Radix |
| State | React Context + `useReducer` |
| Persistence | `localStorage` (v1.0) → Supabase (v1.1) |
| Charts | **Recharts** |
| Icons | **Lucide** |
| Animations | Native CSS + Tailwind keyframes |
| Notifications | **Sonner** |
| Forms | **React Hook Form** + **Zod** |
| Runtime target | Static PWA / Cloudflare Workers (SSR) |

---

## Future Plans

NOVA is designed to grow from a beautiful local tracker into a full financial companion:

- **Cloud sync** across devices with offline-first conflict resolution
- **Real AI** for OCR, categorization, and conversational finance
- **Bank integrations** via Open Banking (PSD2, Plaid, TrueLayer)
- **Investment & crypto** portfolios
- **Cross-platform** — desktop app, Apple Watch, Android Wear, home-screen widgets
- **Households** — shared wallets and family accounts with roles

See the [roadmap](./docs/ROADMAP.md) for the current plan.

---

## Contributing

PRs and issues welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) — it covers coding standards, commit format, and how to add screens, translations, and settings.

---

## License

MIT © NOVA contributors. See [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built with care. Designed for calm.**

</div>