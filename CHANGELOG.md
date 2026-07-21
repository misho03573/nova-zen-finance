# Changelog

All notable changes to NOVA are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-07-21

First production release. NOVA is now a fully functional local-first personal finance app.

### Added
- Dashboard with net worth card, spending summary, and quick actions
- Wallet with grouped transaction history (Today / Yesterday / Earlier) and search
- Add Transaction flow (income, expense, transfer)
- Statistics with weekly / monthly / yearly filters and charts
- Goals with progress tracking and ETA calculation
- Insights hub (behavioral summaries, cash-flow forecast)
- Calendar view of financial activity
- Net Worth page (assets vs. liabilities)
- Subscriptions tracker
- Automation rules
- AI Chat (rule-based assistant)
- Receipt Scanner (simulated OCR)
- CSV Import
- Onboarding flow (5 slides)
- Settings with profile, PIN, backup, and accent color
- Diagnostics page (build info, storage, error log, danger zone)
- Hide-balance mode across all money displays
- Shared `ConfirmDialog` for destructive actions
- `PreviewBadge` for features labelled as preview
- Empty states across Wallet, Goals, Net Worth, Stats
- Recurring transactions auto-advance on app load
- Documentation: `README.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`

### Improved
- Theme system rebuilt on OKLCH semantic tokens
- Currency formatting with real FX conversion across 10 currencies
- Language support extended to 5 languages
- Dashboard animations (staggered rise-in, animated counters, glow)
- Onboarding radius normalized to design tokens
- Diagnostics gains copy-report and clearable error log

### Fixed
- SSR hydration mismatch on the dashboard
- FX conversion previously ignored by `format()`
- Toast positioning colliding with bottom navigation
- `OnboardingGate` redirect flash for returning users
- Year-boundary bug in monthly totals
- Recurring transactions never advancing past their `nextDate`
- Instant deletion of accounts and goals without confirmation

---

## [0.5.0] — NOVA Pro

### Added
- AI Receipt Scanner (simulated)
- AI Chat assistant
- Net Worth page with liabilities
- CSV bank import
- Savings automation rules
- Multi-currency support (BGN, EUR, USD, GBP, +6)
- Subscriptions tracker
- Security: PIN and biometric preferences

---

## [0.4.0] — AI Financial Assistant

### Added
- Insights tab
- Cash-flow forecast (7 / 30 / 90 days)
- Smart budgets
- Calendar view
- Recurring payments (salary, rent, subscriptions)
- Achievements (gamification)
- Natural-language search
- Premium micro-animations

---

## [0.3.0]

### Added
- Account management
- Monthly budgets
- Net Worth card
- Weekly / monthly / yearly filters
- Recurring transactions
- Search
- Settings (dark / light, export)

---

## [0.2.0]

### Added
- Local database (accounts, transactions, categories, goals, budgets)
- Fully functional Add Transaction screen
- Automatic wallet balance updates
- Grouped transaction history
- Currency picker with 10 currencies

---

## [0.1.0]

### Added
- Initial premium dark theme and design system
- Five core screens: Home, Wallet, Add, Statistics, Goals
- Financial score card, balance cards, quick add
- Bottom navigation
- Realistic mock data