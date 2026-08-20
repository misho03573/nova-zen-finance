import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  fullName: string;
  signInEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpEmail: (email: string, password: string, fullName?: string) => Promise<{ error?: string }>;
  updateProfile: (patch: { fullName?: string }) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    fullName:
      (session?.user?.user_metadata?.full_name as string | undefined)?.trim() ||
      session?.user?.email?.split("@")[0] ||
      "",
    async signInEmail(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message };
    },
    async signUpEmail(email, password, fullName) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: fullName ? { full_name: fullName } : undefined,
        },
      });
      return { error: error?.message };
    },
    async updateProfile(patch) {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: patch.fullName },
      });
      return { error: error?.message };
    },
    async signOut() {
      // Never leave financial data cached on a shared device.
      const uid = session?.user?.id;
      try {
        if (typeof window !== "undefined") {
          if (uid) window.localStorage.removeItem(`nova.store.v3.${uid}`);
          window.localStorage.removeItem("nova.store.v3");
        }
      } catch {
        /* ignore */
      }
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}