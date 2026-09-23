import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level regression guards for the accessibility defects fixed in the
 * hardening pass over What-If, Cash-flow Calendar, Data Health and Data Export.
 * These are static checks: they assert the fix stays in place, and touch no
 * financial logic, storage or network.
 */
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const whatif = read("src/routes/whatif.tsx");
const calendar = read("src/routes/calendar.tsx");
const health = read("src/routes/health.tsx");
const exportPage = read("src/routes/export.tsx");
const confirmDialog = read("src/components/nova/ConfirmDialog.tsx");

describe("confirm dialog", () => {
  it("localizes its default cancel and confirm labels", () => {
    expect(confirmDialog).toContain('tr("action.cancel")');
    expect(confirmDialog).toContain('tr("action.confirm")');
    expect(confirmDialog).not.toContain('?? "Cancel"');
    expect(confirmDialog).not.toContain('?? "Confirm"');
  });
});

describe("what-if planner", () => {
  it("keeps a visible focus ring on its inputs", () => {
    // `outline-none` without a replacement ring hides keyboard focus entirely.
    expect(whatif).not.toContain("bg-transparent text-base outline-none");
    expect(whatif).not.toContain("bg-transparent text-sm outline-none");
  });

  it("names the income/expense toggle group and focuses its buttons visibly", () => {
    expect(whatif).toContain('aria-label={tr("wi.direction")}');
    expect(whatif).toContain("focus-visible:ring-ring");
  });
});

describe("cash-flow calendar", () => {
  it("does not claim a grid role without rows or gridcells", () => {
    expect(calendar).not.toContain('role="grid"');
  });

  it("announces the selected day", () => {
    expect(calendar).toContain('role="status"');
  });
});

describe("data health", () => {
  it("announces the findings count and links each disclosure to its panel", () => {
    expect(health).toContain('role="status"');
    expect(health).toContain("aria-controls={`dh-panel-");
    expect(health).toContain("id={`dh-panel-");
  });
});

describe("data export", () => {
  it("keeps JSON-only sections keyboard reachable instead of removing them from tab order", () => {
    expect(exportPage).toContain("aria-disabled={!usable}");
    expect(exportPage).not.toContain("disabled={!usable}");
  });

  it("marks decorative icons as hidden from assistive tech", () => {
    expect(exportPage).toContain('<Download className="h-4 w-4" aria-hidden="true" />');
  });
});
