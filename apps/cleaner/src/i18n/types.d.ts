import type messages from "../../messages/en-AU.json";

import type { AppLocale } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
