import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // The acceptance suite drives `next dev`, and its floating dev-tools badge sits in the
  // bottom-left corner — on top of the tab bar at the 390px test viewport, where it swallows
  // the clicks aimed at a tab. Playwright's webServer sets this flag, so the badge stays put
  // for ordinary local development.
  devIndicators: process.env.E2E_DISABLE_DEV_INDICATORS === "1" ? false : undefined,
  experimental: { globalNotFound: true },
  typedRoutes: true,
  // ADR 0004: the cleaner app stays static-exportable so a Capacitor shell is a bolt-on,
  // not a migration. The build fails if a server dependency creeps back in.
  output: "export",
};

export default nextConfig;
