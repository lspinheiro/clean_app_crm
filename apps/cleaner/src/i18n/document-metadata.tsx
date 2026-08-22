"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { pathWithoutLocale } from "./config";
import { messagesByLocale } from "./messages";
import { useCleanerLocale } from "./provider";

export function DocumentMetadata() {
  const pathname = usePathname();
  const { locale } = useCleanerLocale();

  useEffect(() => {
    const metadata = messagesByLocale[locale].Metadata;
    const route = pathWithoutLocale(pathname);
    const pageTitle =
      route === "/login"
        ? metadata.loginTitle
        : route === "/join"
          ? metadata.joinTitle
          : route === "/board"
            ? metadata.boardTitle
            : route === "/my-jobs"
              ? metadata.myJobsTitle
              : metadata.title;
    document.title = pageTitle === metadata.title
      ? metadata.title
      : `${pageTitle} · ${metadata.title}`;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", metadata.description);
  }, [locale, pathname]);

  return null;
}
