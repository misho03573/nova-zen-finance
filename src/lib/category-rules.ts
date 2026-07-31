/**
 * Smart Category Rules — deterministic, local auto-categorization.
 *
 * Rules are evaluated in priority order (lower number = higher priority).
 * The first enabled rule whose condition matches wins.
 */

export type RuleField = "merchant" | "description" | "amount" | "type";
export type RuleOperator = "contains" | "equals" | "startsWith" | "gt" | "lt";

export type CategoryRule = {
  id: string;
  name: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  categoryId: string;
  enabled: boolean;
  /** Lower runs first. */
  priority: number;
};

export const RULE_FIELDS: RuleField[] = ["merchant", "description", "amount", "type"];
export const RULE_OPERATORS: RuleOperator[] = ["contains", "equals", "startsWith", "gt", "lt"];

/** Operators that make sense for a given field. */
export function operatorsFor(field: RuleField): RuleOperator[] {
  if (field === "amount") return ["gt", "lt", "equals"];
  if (field === "type") return ["equals"];
  return ["contains", "equals", "startsWith"];
}

/** Minimal shape a rule needs to evaluate a transaction. */
export type RuleInput = {
  title?: string;
  note?: string;
  amount: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function matchText(haystack: string, op: RuleOperator, needle: string): boolean {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return false;
  switch (op) {
    case "contains": return h.includes(n);
    case "equals": return h === n;
    case "startsWith": return h.startsWith(n);
    default: return false;
  }
}

export function ruleMatches(rule: CategoryRule, tx: RuleInput): boolean {
  if (!rule.enabled) return false;
  switch (rule.field) {
    case "merchant":
      return matchText(tx.title ?? "", rule.operator, rule.value);
    case "description":
      return matchText(`${tx.note ?? ""} ${tx.title ?? ""}`, rule.operator, rule.value);
    case "amount": {
      const v = Number.parseFloat(rule.value);
      if (!Number.isFinite(v)) return false;
      const abs = Math.abs(tx.amount);
      if (rule.operator === "gt") return abs > v;
      if (rule.operator === "lt") return abs < v;
      if (rule.operator === "equals") return Math.abs(abs - v) < 0.005;
      return false;
    }
    case "type": {
      const want = norm(rule.value);
      const actual = tx.amount >= 0 ? "income" : "expense";
      return want === actual;
    }
    default:
      return false;
  }
}

/** Returns the category id of the highest-priority matching rule, or null. */
export function resolveRuleCategory(
  rules: CategoryRule[] | undefined,
  tx: RuleInput,
): string | null {
  if (!rules || rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) if (ruleMatches(r, tx)) return r.categoryId;
  return null;
}