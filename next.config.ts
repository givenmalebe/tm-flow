import type { NextConfig } from "next";

/**
 * Static export for Firebase Hosting.
 *
 * The app is a single client-rendered page (src/app/page.tsx is "use client"),
 * so there is no server rendering to lose. Firebase Hosting serves the exported
 * `out/` directory from its CDN and rewrites /api and /uploads to the FastAPI
 * backend on Cloud Run via the `rewrites` block in firebase.json — that replaces
 * the Next.js API proxy, which static export cannot emit.
 *
 * `images.unoptimized` is required because the default image optimiser is a
 * server route, which does not exist in a static export.
 */
const BACKEND_URL = (
  process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  /**
   * Dev-only backend proxy.
   *
   * A static export emits no server routes, so `next dev` has nothing to answer
   * /api/* and every request 404s — including the onboarding PUT to
   * /api/company-profile. Firebase Hosting rewrites only exist once the site is
   * deployed, so in development these rewrites stand in for them and forward to
   * the same FastAPI backend (BACKEND_URL).
   *
   * The key is spread in rather than always declared because `next build` warns
   * that rewrites "will not automatically work with output: export" whenever one
   * exists, and firebase.json owns that job in deployed environments.
   */
  ...(process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
          { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
        ],
      }
    : {}),
};

export default nextConfig;
