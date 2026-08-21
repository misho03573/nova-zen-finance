import { describe, it, expect } from "vitest";
import {
  cleanDescriptor,
  merchantKey,
  mergeAliases,
  renameMerchant,
  resolveMerchant,
  summarizeMerchants,
  type MerchantAlias,
} from "./merchant";

describe("merchant normalization", () => {
  it("resolves noisy Lidl descriptors to one identity", () => {
    const raws = ["LIDL 1248 SOFIA", "LIDL BG #5521", "Lidl Store", "LIDL*0820"];
    const keys = new Set(raws.map(merchantKey));
    expect([...keys]).toEqual(["lidl"]);
    expect(cleanDescriptor("LIDL 1248 SOFIA")).toBe("Lidl");
  });

  it("strips processor prefixes and aggregator stars", () => {
    expect(cleanDescriptor("CARD PAYMENT TO SPOTIFY")).toBe("Spotify");
    expect(cleanDescriptor("PAYPAL *NETFLIX")).toBe("Netflix");
    expect(cleanDescriptor("SQ *BLUE BOTTLE COFFEE")).toBe("Blue Bottle Coffee");
  });

  it("does not destroy meaningful multi-word names", () => {
    expect(cleanDescriptor("Whole Foods Market")).toBe("Whole Foods Market");
    expect(cleanDescriptor("7-Eleven")).toBe("7-Eleven");
    expect(cleanDescriptor("H&M")).toBe("H&M");
  });

  it("never returns empty for a non-empty descriptor", () => {
    expect(cleanDescriptor("#12345")).toBe("#12345");
    expect(cleanDescriptor("POS")).toBe("POS");
    expect(cleanDescriptor("   ")).toBe("");
  });

  it("ignores diacritics when building the key", () => {
    expect(merchantKey("Café Central")).toBe(merchantKey("CAFE CENTRAL"));
  });

  it("keeps the raw descriptor for audit", () => {
    const id = resolveMerchant("LIDL 1248 SOFIA");
    expect(id.raw).toBe("LIDL 1248 SOFIA");
    expect(id.label).toBe("Lidl");
  });

  it("applies user renames", () => {
    const aliases = renameMerchant([], "lidl", "Lidl Bulgaria");
    expect(resolveMerchant("LIDL*0820", aliases).label).toBe("Lidl Bulgaria");
  });

  it("clearing a rename with no merges removes the alias", () => {
    const a = renameMerchant([], "lidl", "Lidl BG");
    expect(renameMerchant(a, "lidl", "  ")).toHaveLength(0);
  });

  it("merges identities into one target", () => {
    const aliases = mergeAliases([], "lidl", "Lidl", ["lidlexpress", "lidlbg"]);
    expect(resolveMerchant("LIDL EXPRESS", aliases).key).toBe("lidl");
    expect(resolveMerchant("LIDLBG", aliases).label).toBe("Lidl");
  });

  it("merging an identity carries its existing aliases across", () => {
    const first = mergeAliases([], "lidlexpress", "Lidl Express", ["lidlbg"]);
    const second = mergeAliases(first, "lidl", "Lidl", ["lidlexpress"]);
    expect(resolveMerchant("LIDLBG", second).key).toBe("lidl");
    expect(second).toHaveLength(1);
  });

  it("summarizes transactions by merchant", () => {
    const rows = [
      { title: "LIDL 1248 SOFIA", amount: -20, date: "2026-08-01" },
      { title: "LIDL*0820", amount: -30, date: "2026-08-05" },
      { title: "Spotify", amount: -10, date: "2026-08-03" },
    ];
    const [top] = summarizeMerchants(rows);
    expect(top.key).toBe("lidl");
    expect(top.count).toBe(2);
    expect(top.total).toBe(50);
    expect(top.variants).toHaveLength(2);
    expect(top.lastDate).toBe("2026-08-05");
  });

  it("alias list stays stable across resolution", () => {
    const aliases: MerchantAlias[] = [{ id: "m1", key: "lidl", name: "Lidl", aliases: ["lidlbg"] }];
    resolveMerchant("LIDL BG", aliases);
    expect(aliases).toHaveLength(1);
  });
});
