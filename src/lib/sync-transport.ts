/**
 * Supabase-backed transport for the cloud sync core.
 *
 * Every write is guarded by the row's `rev` counter, so a device holding a
 * stale document simply matches no row and the write is refused instead of
 * overwriting newer financial data.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CloudRow, SyncTransport } from "@/lib/sync-core";

export const supabaseTransport: SyncTransport = {
  async read(userId: string): Promise<CloudRow> {
    const { data, error } = await supabase
      .from("user_data")
      .select("data, rev")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { data: data.data, rev: Number((data as { rev?: number }).rev ?? 0) };
  },

  async create(userId: string, data: unknown): Promise<CloudRow> {
    // Idempotent: a row created concurrently (another tab/device) is kept.
    const { error } = await supabase
      .from("user_data")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ user_id: userId, data: data as any, rev: 0 } as any, {
        onConflict: "user_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(error.message);
    return this.read(userId);
  },

  async write(userId: string, data: unknown, expectedRev: number): Promise<CloudRow> {
    const { data: rows, error } = await supabase
      .from("user_data")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ data: data as any, rev: expectedRev + 1 } as any)
      .eq("user_id", userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("rev" as any, expectedRev as any)
      .select("rev");
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] as { rev?: number } | undefined;
    if (!row) return null; // revision guard failed → conflict
    return { data, rev: Number(row.rev ?? expectedRev + 1) };
  },
};
