/**
 * NOVA cloud sync core.
 *
 * The cloud stores one JSON document per user (`user_data.data`) plus a
 * monotonic `rev` counter. This module owns every rule about when it is safe
 * to read, write, skip or refuse a write. It is transport-agnostic on purpose
 * so the adversarial scenarios (stale device, conflicting sessions, dropped
 * network, interrupted save, retries) can be tested without Supabase.
 *
 * Invariants enforced here:
 *  - A failed read never enables writes (optimistic local state can never
 *    clobber a cloud document we have not seen).
 *  - A write only lands when the cloud is still at the revision we loaded.
 *    A stale write is refused, never applied — we stop rather than silently
 *    picking a winner, and stash the local document for recovery.
 *  - Re-sending the same document is a no-op, so retries cannot duplicate
 *    financial records.
 *  - Writes are single-document, so an interrupted save either lands whole or
 *    not at all: no partially written financial state.
 */

export type CloudRow = { data: unknown; rev: number } | null;

export interface SyncTransport {
  /** Reads the user's document. Throws on network/permission failure. */
  read(userId: string): Promise<CloudRow>;
  /** Creates the first row. Must be idempotent (ignore duplicates). */
  create(userId: string, data: unknown): Promise<CloudRow>;
  /**
   * Writes only if the stored rev still equals `expectedRev`.
   * Returns the new row on success, `null` when the guard failed (conflict).
   * Throws on network failure.
   */
  write(userId: string, data: unknown, expectedRev: number): Promise<CloudRow>;
}

export type LoadOutcome<S> =
  | { status: "loaded"; state: S; rev: number }
  | { status: "created"; state: S; rev: number }
  | { status: "load-error" };

export type SaveOutcome =
  | { status: "skipped" }
  | { status: "disabled" }
  | { status: "saved"; rev: number }
  | { status: "save-error" }
  | { status: "conflict"; remote: unknown; rev: number };

/** Minimal shape validation for a document coming back from the cloud. */
export function sanitizeCloudState<S extends Record<string, unknown>>(raw: unknown): S | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.accounts) || !Array.isArray(o.transactions)) return null;
  return o as S;
}

/** Stable-enough signature used for idempotency checks. */
export function signatureOf(state: unknown): string {
  try {
    return JSON.stringify(state);
  } catch {
    return `\u0000unserializable-${Math.random()}`;
  }
}

/** localStorage key holding a refused (conflicting) local document. */
export function recoveryKeyFor(userId: string): string {
  return `nova.recovery.v1.${userId}`;
}

export class CloudSync<S extends Record<string, unknown>> {
  private rev = 0;
  private userId: string | null = null;
  /** True only after we have actually seen the server document. */
  private writable = false;
  private lastSentSig: string | null = null;
  /** Bumped on every load so late responses from an old user are ignored. */
  private generation = 0;

  constructor(private transport: SyncTransport) {}

  get canWrite() {
    return this.writable;
  }
  get currentRev() {
    return this.rev;
  }

  /** Disables writes (sign-out, unmount, user switch, reset in progress). */
  detach() {
    this.generation++;
    this.writable = false;
    this.userId = null;
    this.lastSentSig = null;
    this.rev = 0;
  }

  async load(userId: string, emptyState: S): Promise<LoadOutcome<S>> {
    const gen = ++this.generation;
    this.userId = userId;
    this.writable = false;
    this.lastSentSig = null;
    this.rev = 0;

    let row: CloudRow;
    try {
      row = await this.transport.read(userId);
    } catch {
      if (gen !== this.generation) return { status: "load-error" };
      // Never enable writes: our local cache may be older than the cloud.
      return { status: "load-error" };
    }
    if (gen !== this.generation) return { status: "load-error" };

    const parsed = row ? sanitizeCloudState<S>(row.data) : null;
    if (row && parsed) {
      this.rev = row.rev ?? 0;
      this.writable = true;
      this.lastSentSig = signatureOf(parsed);
      return { status: "loaded", state: parsed, rev: this.rev };
    }

    // No row yet, or a corrupted document. Both are handled by writing a
    // known-good empty document; a corrupted blob is never fed to the app.
    try {
      const created = await this.transport.create(userId, emptyState);
      if (gen !== this.generation) return { status: "load-error" };
      if (row && !parsed) {
        // Corrupted existing row: overwrite it under its own revision guard.
        const fixed = await this.transport.write(userId, emptyState, row.rev ?? 0);
        if (!fixed) return { status: "load-error" };
        this.rev = fixed.rev ?? 0;
      } else {
        this.rev = created?.rev ?? 0;
      }
      this.writable = true;
      this.lastSentSig = signatureOf(emptyState);
      return { status: "created", state: emptyState, rev: this.rev };
    } catch {
      return { status: "load-error" };
    }
  }

  /**
   * Persists `state`. Returns "skipped" when the document is byte-identical to
   * the last confirmed upload (idempotent retries), "disabled" when writing is
   * not allowed, and "conflict" when the cloud moved ahead of us.
   */
  async save(userId: string, state: S): Promise<SaveOutcome> {
    if (!this.writable || this.userId !== userId) return { status: "disabled" };
    const sig = signatureOf(state);
    if (sig === this.lastSentSig) return { status: "skipped" };

    const gen = this.generation;
    const expected = this.rev;
    let row: CloudRow;
    try {
      row = await this.transport.write(userId, state, expected);
    } catch {
      // Network died mid-upload. The document either landed whole or not at
      // all; we keep writes enabled so the next attempt retries the same rev.
      return { status: "save-error" };
    }
    if (gen !== this.generation) return { status: "disabled" };

    if (!row) {
      // Someone else advanced the revision. Refuse to overwrite them.
      this.writable = false;
      let remote: unknown = null;
      let remoteRev = expected;
      try {
        const fresh = await this.transport.read(userId);
        remote = fresh?.data ?? null;
        remoteRev = fresh?.rev ?? expected;
      } catch {
        /* keep the conflict signal even if the re-read fails */
      }
      return { status: "conflict", remote, rev: remoteRev };
    }

    this.rev = row.rev ?? expected + 1;
    this.lastSentSig = sig;
    return { status: "saved", rev: this.rev };
  }

  /** Adopts a remote document after a conflict, re-enabling writes. */
  adoptRemote(userId: string, state: S, rev: number) {
    this.userId = userId;
    this.rev = rev;
    this.writable = true;
    this.lastSentSig = signatureOf(state);
  }
}
