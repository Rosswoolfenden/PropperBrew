import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@propperbrew/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
};

export default config;
