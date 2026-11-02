import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["node:sqlite", "postgres"],
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
