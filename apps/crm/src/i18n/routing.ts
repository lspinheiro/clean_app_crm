import { defineRouting } from "next-intl/routing";

import {
  defaultLocale,
  localeCookieMaxAgeSeconds,
  localeCookieName,
  locales,
} from "./config";

export const routing = defineRouting({
  defaultLocale,
  localeCookie: {
    maxAge: localeCookieMaxAgeSeconds,
    name: localeCookieName,
    sameSite: "lax",
  },
  localeDetection: true,
  localePrefix: "always",
  locales,
});
