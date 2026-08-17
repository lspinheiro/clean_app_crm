import { getLocale } from "next-intl/server";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";

export default async function HomePage() {
  const locale = await getLocale();
  return redirect({
    href: "/roster",
    locale: isAppLocale(locale) ? locale : defaultLocale,
  });
}
