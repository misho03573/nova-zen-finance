const COLLECTION_KEYS = [
  "accounts", "transactions", "goals", "budgets", "recurring", "liabilities",
  "subscriptions", "automationRules", "categories", "categoryRules", "merchants",
  "netWorthHistory",
] as const;

/** Repairs optional collections while rejecting documents without valid core data. */
export function sanitizePersistedState<T extends Record<string, unknown>>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.accounts) || !Array.isArray(value.transactions)) return null;
  const safe: Record<string, unknown> = { ...value };
  for (const key of COLLECTION_KEYS) if (!Array.isArray(safe[key])) safe[key] = [];
  if (!safe.settings || typeof safe.settings !== "object" || Array.isArray(safe.settings)) safe.settings = {};
  return safe as T;
}