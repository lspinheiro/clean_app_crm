"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import {
  describeOfferFailure,
  type OfferRpcError,
} from "@/features/offers/application";
import { parseOffers, type CleanerOffer } from "@/features/offers/types";
import type { AppLocale } from "@/i18n/config";
import { localePath } from "@/i18n/config";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { OfferCard, type OfferAction } from "./offer-card";

// The privacy boundary is visible in this allow-list: it contains no client name or phone,
// client charge, site address, access notes, or internal notes. Pay is the posted AUD amount;
// `pay_basis` does not exist in the delivered M6 view.
const offerColumns =
  "offer_id, status, company_name, target_kind, site_name, suburb, service_name, service_slug, scheduled_start, weekday, local_start_time, frequency, duration_minutes, cleaner_pay_cents, crew_size";

type OffersState =
  | { status: "loading" }
  | { status: "ready"; offers: CleanerOffer[] }
  | { status: "error" }
  | { status: "session" };

type OfferNotice =
  | { kind: "accepted" }
  | { kind: "declined" }
  | { kind: "rpc"; message: OfferRpcError }
  | { kind: "unknown"; action: OfferAction };

async function loadOffers(): Promise<OffersState> {
  const { data, error } = await getSupabaseClient()
    .from("cleaner_offers")
    .select(offerColumns)
    .order("created_at", { ascending: false });

  if (error) {
    return describeOfferFailure(error).kind === "session"
      ? { status: "session" }
      : { status: "error" };
  }

  try {
    return { status: "ready", offers: parseOffers(data ?? []) };
  } catch {
    // A malformed view row is a contract failure, never a target shape to guess around.
    return { status: "error" };
  }
}

export default function OffersPage() {
  const router = useRouter();
  const replace = router.replace;
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Offers");
  const commonT = useTranslations("Common");
  const cleaner = useCleaner();
  const [list, setList] = useState<OffersState>({ status: "loading" });
  const [actions, setActions] = useState<Record<string, OfferAction>>({});
  const [notice, setNotice] = useState<OfferNotice | null>(null);
  const issuedTicket = useRef(0);
  const appliedTicket = useRef(0);

  const readOffers = useCallback(async () => {
    const ticket = ++issuedTicket.current;
    const next = await loadOffers();

    if (next.status === "session") {
      replace(localePath(locale, "/login"));
      return;
    }

    if (ticket > appliedTicket.current) {
      appliedTicket.current = ticket;
      setList(next);
    }
  }, [locale, replace]);

  useEffect(() => {
    void readOffers();
  }, [readOffers]);

  const resolveOffer = useCallback(
    async (offerId: string, action: OfferAction) => {
      setActions((previous) => ({ ...previous, [offerId]: action }));
      setNotice(null);

      const { error } = await getSupabaseClient().rpc(
        action === "accept" ? "accept_offer" : "decline_offer",
        { target_offer_id: offerId },
      );
      const failure = error ? describeOfferFailure(error) : null;

      await readOffers();

      if (!failure) {
        setNotice({ kind: action === "accept" ? "accepted" : "declined" });
      } else if (failure.kind === "session") {
        replace(localePath(locale, "/login"));
      } else if (failure.kind === "rpc") {
        setNotice({ kind: "rpc", message: failure.message });
      } else {
        setNotice({ kind: "unknown", action });
      }

      setActions((previous) => {
        const next = { ...previous };
        delete next[offerId];
        return next;
      });
    },
    [locale, readOffers, replace],
  );

  if (cleaner.status !== "allowed") return null;

  const offers = list.status === "ready" ? list.offers : [];
  const pending = offers.filter((offer) => offer.status === "pending");
  const history = offers.filter((offer) => offer.status !== "pending");

  function noticeContent(current: OfferNotice) {
    switch (current.kind) {
      case "accepted":
        return (
          <>
            {t("acceptedNotice")} {" "}
            <Link href={localePath(locale, "/my-jobs")}>{t("viewMyJobs")}</Link>
          </>
        );
      case "declined":
        return t("declinedNotice");
      case "rpc":
        return current.message;
      case "unknown":
        return current.action === "accept" ? t("errorAccept") : t("errorDecline");
    }
  }

  function renderOffer(offer: CleanerOffer) {
    return (
      <OfferCard
        action={actions[offer.id] ?? null}
        key={offer.id}
        offer={offer}
        onAccept={(offerId) => void resolveOffer(offerId, "accept")}
        onDecline={(offerId) => void resolveOffer(offerId, "decline")}
      />
    );
  }

  return (
    <main className="screen offers-screen">
      <header className="screen-heading">
        <h1 className="screen-title">{t("title")}</h1>
        <p className="screen-lead">{t("lead")}</p>
      </header>

      {notice ? (
        <p
          className={notice.kind === "accepted" || notice.kind === "declined"
            ? "offers-notice offers-notice--success"
            : "offers-notice offers-notice--error"}
          role={notice.kind === "accepted" || notice.kind === "declined" ? "status" : "alert"}
        >
          {noticeContent(notice)}
        </p>
      ) : null}

      {list.status === "loading" ? <OffersSkeleton label={t("loading")} /> : null}

      {list.status === "error" ? (
        <div className="empty-state empty-state--error">
          <BrandBubbles size={44} />
          <div>
            <p className="empty-state__title">{t("loadErrorTitle")}</p>
            <p>{t("loadErrorBody")}</p>
          </div>
          <button
            className="button button--secondary button--small"
            onClick={() => {
              setList({ status: "loading" });
              void readOffers();
            }}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      ) : null}

      {list.status === "ready" && offers.length === 0 ? (
        <div className="empty-state">
          <BrandBubbles size={44} />
          <div>
            <p className="empty-state__title">{t("emptyTitle")}</p>
            <p>{t("emptyBody")}</p>
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="offers-section">
          <div className="offers-section__head">
            <h2>{t("waitingTitle")}</h2>
            <span>{t("waitingCount", { count: pending.length })}</span>
          </div>
          <ul aria-label={t("waitingList")} className="offer-list">
            {pending.map(renderOffer)}
          </ul>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="offers-section offers-section--history">
          <h2>{t("historyTitle")}</h2>
          <ul aria-label={t("historyList")} className="offer-list">
            {history.map(renderOffer)}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function OffersSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy="true" className="board-skeleton" role="status">
      <span className="visually-hidden">{label}</span>
      {[0, 1].map((item) => (
        <div aria-hidden="true" className="board-skeleton__card" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
