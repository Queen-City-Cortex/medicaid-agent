import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname!, '../../'),
};

// Source-map upload is gated on SENTRY_AUTH_TOKEN: without it (local builds,
// CI image-build job) `sourcemaps.disable` is true, so `next build` succeeds
// and uploads nothing. With it (Railway web build), maps upload under
// SENTRY_RELEASE so production stack traces are un-minified. Supports the
// default Next 16 Turbopack build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
