import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  typedRoutes: true,
  // ADR 0004: the cleaner app stays static-exportable so a Capacitor shell is a bolt-on,
  // not a migration. The build fails if a server dependency creeps back in.
  output: "export",
};

export default nextConfig;
