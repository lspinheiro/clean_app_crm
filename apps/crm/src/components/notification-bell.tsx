"use client";

import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/browser";

export type ApplicationNotification = {
  id: string;
  jobId: string;
  siteName: string;
  createdAt: string;
  readAt: string | null;
};

type NotificationBellProps = {
  notifications: ApplicationNotification[];
  profileId: string;
};

export function NotificationBell({ notifications, profileId }: NotificationBellProps) {
  const locale = useLocale();
  const t = useTranslations("Navigation");
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(() => new Set());
  const sortedItems = useMemo(
    () => notifications
      .map((item) => locallyReadIds.has(item.id) && item.readAt === null
        ? { ...item, readAt: item.createdAt }
        : item)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [locallyReadIds, notifications],
  );
  const unreadIds = sortedItems.filter((item) => item.readAt === null).map((item) => item.id);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`application-notifications:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // Realtime still enforces notifications_select_own; this avoids refreshes for other types.
          filter: "type=eq.application_received",
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, router]);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && !event.composedPath().includes(menu)) menu.open = false;
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      event.preventDefault();
      menu.open = false;
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  async function markUnreadAsRead() {
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", unreadIds)
      .is("read_at", null);
    if (!error) {
      setLocallyReadIds((current) => new Set([...current, ...unreadIds]));
    }
  }

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  return (
    <details className="notification-menu" ref={menuRef}>
      <summary
        aria-label={unreadIds.length
          ? t("notificationsUnread", { count: unreadIds.length })
          : t("notifications")}
        className="icon-button notification-menu__trigger"
        onClick={() => void markUnreadAsRead()}
        ref={triggerRef}
        role="button"
      >
        <Bell aria-hidden="true" size={21} strokeWidth={2.15} />
        {unreadIds.length ? (
          <span className="notification-menu__badge tabular-numerals" aria-hidden="true">
            {unreadIds.length > 9 ? "9+" : unreadIds.length}
          </span>
        ) : null}
      </summary>
      <div className="notification-menu__panel">
        <div className="notification-menu__heading">
          <strong>{t("notifications")}</strong>
        </div>
        {sortedItems.length ? (
          <ul aria-label={t("notifications")} className="notification-menu__list">
            {sortedItems.map((item) => (
              <li className={item.readAt ? undefined : "notification-menu__item--unread"} key={item.id}>
                <Link href={`/jobs/${item.jobId}#applications`} onClick={closeMenu}>
                  <span>{t("newApplication", { siteName: item.siteName })}</span>
                  <time dateTime={item.createdAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notification-menu__empty">{t("noNotifications")}</p>
        )}
      </div>
    </details>
  );
}
