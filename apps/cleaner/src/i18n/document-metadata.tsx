"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { pathWithoutLocale } from "./config";

export function DocumentMetadata() {
  const pathname = usePathname();
  const t = useTranslations("Metadata");

  useEffect(() => {
    const route = pathWithoutLocale(pathname);
    const pageTitle =
      route === "/login"
        ? t("loginTitle")
        : route === "/join"
          ? t("joinTitle")
          : route === "/board"
            ? t("boardTitle")
            : route === "/offers"
              ? t("offersTitle")
            : route === "/my-jobs"
              ? t("myJobsTitle")
              : t("title");
    const productTitle = t("title");
    document.title = pageTitle === productTitle
      ? productTitle
      : `${pageTitle} · ${productTitle}`;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", t("description"));
  }, [pathname, t]);

  return null;
}
