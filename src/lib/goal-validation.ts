export type GoalValues = { target: number; saved: number; monthly: number };

export function parseGoalValues(target: string, saved: string, monthly: string): GoalValues | null {
  const [t, s, m] = [target, saved, monthly].map(Number);
  if (!Number.isFinite(t) || !Number.isFinite(s) || !Number.isFinite(m) || t <= 0 || s < 0 || m < 0) return null;
  return { target: t, saved: s, monthly: m };
}

export function parseContribution(value: string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}