import { join } from "node:path";
import type { NextConfig } from "next";

// The deployed image (Dockerfile.fly) runs Next's self-contained server; tests and the local
// preview use `next start`.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const config: NextConfig = {
  transpilePackages: ["@propperbrew/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }] },
  ...(standalone && { output: "standalone", outputFileTracingRoot: join(import.meta.dirname, "../..") }),
};

export default config;
