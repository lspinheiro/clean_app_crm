import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // The acceptance suite drives `next dev`, whose floating dev-tools badge overlays the
  // bottom-left of every page and can swallow clicks aimed at whatever sits underneath.
  // Playwright's webServer sets this flag; ordinary local development keeps the badge.
  devIndicators: process.env.E2E_DISABLE_DEV_INDICATORS === "1" ? false : undefined,
  typedRoutes: true,
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
