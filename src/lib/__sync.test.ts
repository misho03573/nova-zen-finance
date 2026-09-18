import { describe, expect, it } from "vitest";
import { CloudSync, sanitizeCloudState, signatureOf, recoveryKeyFor } from "@/lib/sync-core";
import type { CloudRow, SyncTransport } from "@/lib/sync-core";

type Doc = Record<string, unknown> & { accounts: unknown[]; transactions: unknown[] };

const doc = (label: string, txs: unknown[] = []): Doc => ({
  accounts: [{ id: "a1", name: label, balance: 100 }],
  transactions: txs,
});

/** In-memory cloud implementing the same revision guard as Postgres. */
class FakeCloud implements SyncTransport {
  row: { data: unknown; rev: number } | null = null;
  writes = 0;
  failRead = false;
  failWrite = false;

  async read(): Promise<CloudRow> {
    if (this.failRead) throw new Error("network");
    return this.row ? { ...this.row } : null;
  }
  async create(_u: string, data: unknown): Promise<CloudRow> {
    if (this.failWrite) throw new Error("network");
    if (!this.row) this.row = { data, rev: 0 };
    return { ...this.row };
  }
  async write(_u: string, data: unknown, expectedRev: number): Promise<CloudRow> {
    if (this.failWrite) throw new Error("network");
    if (!this.row || this.row.rev !== expectedRev) return null; // conflict
    this.writes++;
    this.row = { data, rev: expectedRev + 1 };
    return { ...this.row };
  }
}

const empty: Doc = { accounts: [], transactions: [] };

describe("sanitizeCloudState", () => {
  it("rejects malformed / corrupted cloud documents", () => {
    expect(sanitizeCloudState(null)).toBeNull();
    expect(sanitizeCloudState("nope")).toBeNull();
    expect(sanitizeCloudState([])).toBeNull();
    expect(sanitizeCloudState({ accounts: [] })).toBeNull();
    expect(sanitizeCloudState({ accounts: [], transactions: [] })).not.toBeNull();
  });
});

describe("load", () => {
  it("creates an empty document on first sign-in", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    const res = await s.load("u1", empty);
    expect(res.status).toBe("created");
    expect(cloud.row?.rev).toBe(0);
    expect(s.canWrite).toBe(true);
  });

  it("a failed read never enables writes (no clobbering the cloud)", async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: doc("cloud"), rev: 4 };
    cloud.failRead = true;
    const s = new CloudSync<Doc>(cloud);
    const res = await s.load("u1", empty);
    expect(res.status).toBe("load-error");
    expect(s.canWrite).toBe(false);
    const save = await s.save("u1", doc("stale local"));
    expect(save.status).toBe("disabled");
    expect(cloud.row).toEqual({ data: doc("cloud"), rev: 4 });
  });

  it("replaces a corrupted cloud document instead of feeding it to the app", async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { garbage: true }, rev: 7 };
    const s = new CloudSync<Doc>(cloud);
    const res = await s.load("u1", empty);
    expect(res.status).toBe("created");
    expect(res.status === "created" && res.state).toEqual(empty);
    expect(cloud.row.rev).toBe(8);
  });

  it("newer cloud data wins over a stale local cache", async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: doc("cloud-newer"), rev: 9 };
    const s = new CloudSync<Doc>(cloud);
    const res = await s.load("u1", empty);
    expect(res.status).toBe("loaded");
    expect(res.status === "loaded" && res.state).toEqual(doc("cloud-newer"));
    expect(s.currentRev).toBe(9);
  });
});

describe("save", () => {
  it("advances the revision on every accepted write", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    await s.load("u1", empty);
    await s.save("u1", doc("one"));
    expect(s.currentRev).toBe(1);
    await s.save("u1", doc("two"));
    expect(s.currentRev).toBe(2);
  });

  it("is idempotent: re-saving identical state does not write again", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    await s.load("u1", empty);
    const d = doc("same", [{ id: "t1", amount: 10 }]);
    expect((await s.save("u1", d)).status).toBe("saved");
    expect((await s.save("u1", { ...d })).status).toBe("skipped");
    expect(cloud.writes).toBe(1);
  });

  it("a retried save after a network failure does not duplicate records", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    await s.load("u1", empty);
    const d = doc("with tx", [{ id: "t1", amount: 10 }]);
    cloud.failWrite = true;
    expect((await s.save("u1", d)).status).toBe("save-error");
    cloud.failWrite = false;
    expect((await s.save("u1", d)).status).toBe("saved");
    expect((cloud.row!.data as Doc).transactions).toHaveLength(1);
    expect(cloud.writes).toBe(1);
  });

  it("refuses a stale write when another session moved ahead", async () => {
    const cloud = new FakeCloud();
    const a = new CloudSync<Doc>(cloud);
    const b = new CloudSync<Doc>(cloud);
    await a.load("u1", empty);
    await b.load("u1", empty);

    expect((await a.save("u1", doc("from A", [{ id: "t1" }]))).status).toBe("saved");
    const res = await b.save("u1", doc("from B"));
    expect(res.status).toBe("conflict");
    // A's data survives untouched; B stops writing entirely.
    expect((cloud.row!.data as Doc).transactions).toHaveLength(1);
    expect(b.canWrite).toBe(false);
    expect((await b.save("u1", doc("still B"))).status).toBe("disabled");
    expect(cloud.writes).toBe(1);
  });

  it("a conflict hands back the remote document for recovery", async () => {
    const cloud = new FakeCloud();
    const a = new CloudSync<Doc>(cloud);
    const b = new CloudSync<Doc>(cloud);
    await a.load("u1", empty);
    await b.load("u1", empty);
    await a.save("u1", doc("A"));
    const res = await b.save("u1", doc("B"));
    expect(res.status === "conflict" && res.remote).toEqual(doc("A"));
    expect(res.status === "conflict" && res.rev).toBe(1);
  });

  it("deleted records cannot be resurrected by a stale device", async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: doc("base", [{ id: "t1" }, { id: "t2" }]), rev: 1 };
    const stale = new CloudSync<Doc>(cloud);
    await stale.load("u1", empty); // stale holds both transactions at rev 1
    // Another device deletes t2.
    const other = new CloudSync<Doc>(cloud);
    await other.load("u1", empty);
    await other.save("u1", doc("base", [{ id: "t1" }]));
    // The stale device tries to push its old copy back.
    const res = await stale.save("u1", doc("base", [{ id: "t1" }, { id: "t2" }]));
    expect(res.status).toBe("conflict");
    expect((cloud.row!.data as Doc).transactions).toHaveLength(1);
  });

  it("adopting the remote document re-enables safe writes", async () => {
    const cloud = new FakeCloud();
    const a = new CloudSync<Doc>(cloud);
    const b = new CloudSync<Doc>(cloud);
    await a.load("u1", empty);
    await b.load("u1", empty);
    await a.save("u1", doc("A"));
    const res = await b.save("u1", doc("B"));
    expect(res.status).toBe("conflict");
    if (res.status !== "conflict") return;
    b.adoptRemote("u1", res.remote as Doc, res.rev);
    expect((await b.save("u1", doc("merged"))).status).toBe("saved");
    expect((cloud.row!.data as Doc).accounts[0]).toMatchObject({ name: "merged" });
  });

  it("logout / user switch cancels in-flight writes", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    await s.load("u1", empty);
    s.detach();
    expect((await s.save("u1", doc("after logout"))).status).toBe("disabled");
    expect(cloud.writes).toBe(0);
  });

  it("a save for a different user than the loaded one is refused", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    await s.load("u1", empty);
    expect((await s.save("u2", doc("wrong user"))).status).toBe("disabled");
  });

  it("a load that is superseded mid-flight cannot write", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    const p = s.load("u1", empty);
    s.detach(); // e.g. user signed out while the read was in flight
    await p;
    expect(s.canWrite).toBe(false);
    expect(cloud.writes).toBe(0);
  });

  it("a reset is written as one whole document, never partially", async () => {
    const cloud = new FakeCloud();
    const s = new CloudSync<Doc>(cloud);
    cloud.row = { data: doc("old", [{ id: "t1" }, { id: "t2" }]), rev: 3 };
    await s.load("u1", empty);
    expect((await s.save("u1", empty)).status).toBe("saved");
    expect(cloud.row.data).toEqual(empty);
  });
});

describe("helpers", () => {
  it("signatures differ for different documents and match for equal ones", () => {
    expect(signatureOf(doc("x"))).toBe(signatureOf(doc("x")));
    expect(signatureOf(doc("x"))).not.toBe(signatureOf(doc("y")));
  });
  it("namespaces the recovery key per user", () => {
    expect(recoveryKeyFor("u1")).toBe("nova.recovery.v1.u1");
  });
});
