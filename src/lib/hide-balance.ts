import { useNova } from "@/lib/nova-store";

export const HIDDEN_LG = "••••••";
export const HIDDEN_MD = "••••";

export function useHideBalances() {
  const { state } = useNova();
  return !!state.settings.hideBalances;
}

export function maskAmount(hide: boolean, formatted: string, size: "sm" | "md" | "lg" = "md") {
  if (!hide) return formatted;
  return size === "lg" ? HIDDEN_LG : HIDDEN_MD;
}