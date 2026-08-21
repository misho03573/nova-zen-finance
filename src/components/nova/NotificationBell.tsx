import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/use-financial-context";
import { useT } from "@/lib/i18n";

/** Header entry point into the Smart Notifications Center. */
export function NotificationBell() {
  const { unread } = useNotifications();
  const t = useT();
  return (
    <Link
      to="/notifications"
      aria-label={t("ntf.title")}
      className="press relative grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur transition-colors hover:bg-card"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
