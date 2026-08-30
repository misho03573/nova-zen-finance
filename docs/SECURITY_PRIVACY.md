# NOVA — Security & Privacy

Internal reference. Contains no secrets, keys or credentials.

## Auth model

- Email/password and Google sign-in, both handled by the managed auth service.
- Session lives in the browser's storage, managed by the auth SDK; the app
  never reads or copies the access token itself.
- `src/lib/auth.tsx` is the single source of session truth (`user`, `session`,
  `loading`). All data hydration keys off `user.id`.
- Sign-out clears the session **and** the active user's cached financial data
  (`clearLocalNovaData`) before the auth call, so a shared device never keeps
  the previous person's finances readable.

## User-data isolation

- Cloud state lives in one row per user in `user_data`, keyed by `user_id`.
- Reads are always `.eq("user_id", userId)` with the id taken from the verified
  session — never from UI state, form input or a URL.
- Writes upsert on `user_id` with the same session-derived id.
- Row Level Security is enabled; policies restrict select/insert/update/delete
  to `auth.uid() = user_id` for the `authenticated` role only. `anon` has no
  grant, so a signed-out client cannot read any row.
- Assumption: the client is untrusted. Isolation is enforced by RLS, not by
  client-side filtering.

## Local cache behaviour

Owned by `src/lib/local-cache.ts`.

| Key | Class | Cleared on sign-out / reset |
| --- | --- | --- |
| `nova.store.v3.<userId>` | financial | yes |
| `nova.store.v3` (guest) | financial (demo) | yes |
| `nova.store.v2`, `nova.store.v1` | legacy financial | yes |
| `nova.txfilters.v1.<userId\|guest>` | financial (filters) | yes |
| `nova.theme`, accent, language, currency | preference | no |
| `nova.onboarded.v1` | onboarding | no |
| auth SDK session key | auth | cleared by sign-out |

Preferences and the onboarding flag persist deliberately: they contain no
financial or identifying data.

"Reset all data" resets the in-memory store to empty (which propagates to the
cloud row for signed-in users) and only then wipes local keys — otherwise the
next load would re-hydrate the deleted data from the cloud.

## Cloud sync failure behaviour

`src/lib/sync-status.ts` states: `local`, `saving`, `synced`, `offline`,
`load-error`, `save-error`.

- A failed **load** marks the session read-only for the cloud: the optimistic
  local cache is never uploaded, so a stale device cannot clobber newer data
  written elsewhere.
- A failed **save** surfaces `save-error`; the UI never shows "Synced" after a
  failed write.
- Offline is detected via `online`/`offline` events and shown honestly.
- There is no automatic merge. Conservative behaviour (read-only) is preferred
  over invented conflict resolution.

## AI context privacy boundary

`src/lib/ai-context.ts` builds an `AiSnapshot` of aggregated, rounded numbers
plus category ids. Excluded by construction: transaction titles and notes,
account names/numbers/holders, user names and emails, PINs, and all internal
ids. Merchant labels are opt-in only (`includeMerchants`). Deterministic
financial maths lives in `financial-context.ts`, separate from any text
generation. `src/lib/__privacy.test.ts` asserts these exclusions.

## Import & diagnostics

- Imported CSV rows are parsed in memory; raw file contents are never logged.
- Invalid rows stay in the import preview UI and are not written to
  diagnostics or the console.
- Duplicate detection is read-only — it flags rows, it never mutates existing
  transactions.
- Diagnostics records localStorage **key names and byte sizes only**, never
  values, and redacts user ids from copied reports. Its wipe action is scoped
  to `nova.*` keys.
- Console output is minimal in production: sync failures log only the error
  message and only under `import.meta.env.DEV`.

## Export / backup

- Export serialises the active in-memory store, which is the signed-in user's
  data only. It contains no tokens, keys or session material.
- Filenames are `nova-export-<YYYY-MM-DD>.json` — no name, email or user id.
- Integrity "repair" works on the same active-user state, so a repair backup
  can never include another account's cache.

## Destructive actions

All of the following require an explicit confirm dialog: reset all data,
delete account (with balance reassignment), delete transaction (paired
transfers deleted together, intentionally), delete goal, budget, subscription
and automation rule, integrity repair-all, and diagnostics storage wipe.
Nothing cascades into unrelated financial records.

## App lock (PIN, biometrics, auto-lock)

- The 6-digit PIN is never stored. `src/lib/pin.ts` derives a PBKDF2-SHA256
  hash (120k iterations, random per-credential salt); only the hash is kept.
- All lock state transitions live in `src/lib/lock-core.ts` (headless, tested);
  `src/lib/lock.tsx` only owns React/UI state and lifecycle wiring.
- Disabling the lock requires the current PIN, or a successful biometric
  authentication when biometrics are enabled. "Lock now" is available in
  Settings whenever a PIN exists.
- Lock config lives in secure storage (`src/lib/secure-store.ts`): iOS
  Keychain / Android Keystore in the native shell, namespaced localStorage on
  the web. It never enters the NOVA store, so it is never synced to the cloud.

- Biometrics (Face ID / Touch ID) run through the native plugin and can only
  be enabled once a PIN exists — biometrics are never the only way in. On the
  web the row is labelled "Requires native app" and is disabled.
- Auto-lock (`src/lib/lock-policy.ts`) locks on cold launch, on resume after
  the chosen delay, and on foreground inactivity. "Immediately" applies to
  backgrounding only, so an app in active use is never locked mid-typing.
- `LockGate` in `src/routes/__root.tsx` renders the lock screen instead of the
  app, so no financial data is painted while locked.
- Any legacy plaintext PIN from earlier builds is dropped on store hydrate and
  never re-persisted.
- Receipt scanning is still simulated; no camera or OCR runs today.

## Known remaining risks

1. Local cache is plaintext in localStorage; a person with the unlocked device
   and devtools can read it while a session is active.
2. No server-side session revocation UX (no "sign out other devices").
3. Last-writer-wins across devices for the single `user_data` row; there is no
   merge or per-record versioning.
4. Export files are unencrypted by design once downloaded.
5. On the web the PIN hash lives in localStorage rather than a Keychain, so
   web app-lock is a deterrent, not device-bound security. Only the native
   shell gives Keychain/Keystore-backed storage and biometrics.
