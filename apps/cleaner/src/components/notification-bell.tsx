"use client";

import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatJobDate, formatJobTime } from "@/features/board/format";
import {
  toCleanerNotifications,
  type CleanerNotification,
  type CleanerNotificationRow,
} from "@/features/notifications/model";
import type { AppLocale } from "@/i18n/config";
import { localePath } from "@/i18n/config";
import { getServiceLabel } from "@/i18n/service-label";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * The address and the access notes are not in this list because they are not in the view:
 * disclosing them is a write-audited operation behind `get_cleaner_job_access()`.
 */
const notificationColumns =
  "notification_id, job_id, type, read_at, created_at, company_name, site_name, suburb, service_name, service_slug, scheduled_start";

/** One phone screen's worth of history. Older news is not what a bell is for. */
const listLimit = 20;

type NotificationBellProps = {
  profileId: string;
};

type BellState =
  | { status: "loading" }
  | { status: "ready"; items: CleanerNotification[]; unreadIds: string[] }
  | { status: "error" };

async function loadNotifications(): Promise<BellState> {
  const supabase = getSupabaseClient();
  const [history, unread] = await Promise.all([
    supabase
      .from("cleaner_notifications")
      .select(notificationColumns)
      .order("created_at", { ascending: false })
      .limit(listLimit),
    supabase
      .from("cleaner_notifications")
      .select("notification_id")
      .is("read_at", null),
  ]);
  if (history.error || unread.error) return { status: "error" };
  return {
    status: "ready",
    items: toCleanerNotifications((history.data ?? []) as CleanerNotificationRow[]),
    unreadIds: (unread.data ?? []).flatMap((row) =>
      row.notification_id ? [row.notification_id] : []
    ),
  };
}

export function NotificationBell({ profileId }: NotificationBellProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Notifications");
  const commonT = useTranslations("Common");
  const servicesT = useTranslations("Services");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [bell, setBell] = useState<BellState>({ status: "loading" });
  const [locallyReadIds, setLocallyReadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // A live insert and the mount read can be in flight together, so an older answer must
  // never overwrite a newer one. Same guard the board and My jobs screens use.
  const issuedTicket = useRef(0);
  const appliedTicket = useRef(0);

  const readNotifications = useCallback(async () => {
    const ticket = ++issuedTicket.current;
    const next = await loadNotifications();
    if (ticket <= appliedTicket.current) return;
    appliedTicket.current = ticket;
    // A re-read that fails must not throw away news already on screen. Blanking the badge
    // would tell her there is nothing unread while the database still holds her job — the
    // one claim this bell exists to get right. The error state is for a bell that has
    // never loaded, not for a dropped refresh.
    setBell((current) =>
      next.status === "error" && current.status === "ready" ? current : next,
    );
  }, []);

  useEffect(() => {
    void readNotifications();
  }, [readNotifications]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`cleaner-notifications:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // Realtime still applies notifications_select_own; this keeps the app from
          // re-reading for news addressed to somebody else.
          filter: `recipient_id=eq.${profileId}`,
        },
        // ADR 0004 makes this app a static export: there is no server render to
        // invalidate, so the bell reloads its own list.
        () => void readNotifications(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, readNotifications]);

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
      // Focus left on a closed panel strands anyone not using a pointer.
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  const items = useMemo(() => (bell.status === "ready" ? bell.items : []), [bell]);
  const unreadIds = useMemo(
    () =>
      bell.status === "ready"
        ? bell.unreadIds.filter((notificationId) => !locallyReadIds.has(notificationId))
        : [],
    [bell, locallyReadIds],
  );

  async function markUnreadAsRead() {
    if (!unreadIds.length) return;
    const { error } = await getSupabaseClient()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      // `is("read_at", null)` leaves a row another device already marked with its own
      // timestamp. Clearing the badge before the write lands would lose the news on the
      // next open, so local state follows the database rather than leading it.
      .in("id", unreadIds)
      .is("read_at", null);
    if (!error) {
      setLocallyReadIds((current) => new Set([...current, ...unreadIds]));
    }
  }

  return (
    <details className="notification-menu" ref={menuRef}>
      <summary
        aria-label={unreadIds.length ? t("unread", { count: unreadIds.length }) : t("title")}
        className="notification-menu__trigger"
        onClick={() => void markUnreadAsRead()}
        ref={triggerRef}
        role="button"
      >
        <Bell aria-hidden="true" size={20} strokeWidth={2} />
        {unreadIds.length ? (
          <span aria-hidden="true" className="notification-menu__badge">
            {unreadIds.length > 9 ? "9+" : unreadIds.length}
          </span>
        ) : null}
      </summary>
      <div className="notification-menu__panel">
        <div className="notification-menu__heading">
          <strong>{t("title")}</strong>
        </div>
        {bell.status === "loading" ? (
          <p className="notification-menu__empty" role="status">
            {commonT("loading")}
          </p>
        ) : bell.status === "error" ? (
          <div className="notification-menu__empty" role="alert">
            <p>{t("loadError")}</p>
            <button
              className="button button--secondary button--small"
              onClick={() => {
                setBell({ status: "loading" });
                void readNotifications();
              }}
              type="button"
            >
              {commonT("retry")}
            </button>
          </div>
        ) : items.length ? (
          <ul aria-label={t("title")} className="notification-menu__list">
            {items.map((item) => (
              <li
                className={
                  item.readAt === null && !locallyReadIds.has(item.notificationId)
                    ? "notification-menu__item--unread"
                    : undefined
                }
                key={item.notificationId}
              >
                <Link
                  href={localePath(locale, item.destination)}
                  onClick={() => {
                    if (menuRef.current) menuRef.current.open = false;
                  }}
                >
                  <span className="notification-menu__label">{t(item.copyKey)}</span>
                  <span className="notification-menu__detail">
                    {getServiceLabel(
                      { name: item.serviceName, slug: item.serviceSlug },
                      servicesT,
                    )}
                    {" · "}
                    {item.siteName}, {item.suburb}
                  </span>
                  <time dateTime={item.scheduledStart}>
                    {formatJobDate(item.scheduledStart, locale)}
                    {" · "}
                    {formatJobTime(item.scheduledStart, locale)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notification-menu__empty">{t("empty")}</p>
        )}
      </div>
    </details>
  );
}
