import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const BASE_DIRECTIVES = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': @react-pdf/renderer's layout engine (yoga-layout) compiles WebAssembly;
  // it allows WebAssembly compilation only, JS eval() stays blocked.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  // data: - the PDF layout engine (yoga-layout) fetches its WebAssembly from a data: URL.
  "connect-src 'self' data:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
];

/** Sentry security (CSP report) endpoint derived from the DSN, or null when unset/invalid. */
function sentryReportUri(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split('/').filter(Boolean).pop();
    if (!url.username || !projectId) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
}

const REPORT_GROUP = 'csp-endpoint';

/**
 * Local `next dev` only: React needs eval() for its dev-mode debugging (callstack
 * reconstruction), and Vercel Analytics / Speed Insights load their debug scripts from
 * va.vercel-scripts.com (production serves them same-origin from /_vercel/*). Never sent
 * outside NODE_ENV=development, so preview and production keep the exact policy.
 */
const DEV_SCRIPT_SRC =
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://va.vercel-scripts.com";

export function buildSecurityHeaders(
  dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN,
  isDev: boolean = process.env.NODE_ENV === 'development'
) {
  const reportUri = sentryReportUri(dsn);
  const base = isDev
    ? BASE_DIRECTIVES.map((d) =>
        d.startsWith('script-src ') ? DEV_SCRIPT_SRC : d
      )
    : BASE_DIRECTIVES;
  const directives = reportUri
    ? [...base, `report-uri ${reportUri}`, `report-to ${REPORT_GROUP}`]
    : base;
  return [
    { key: 'Content-Security-Policy', value: directives.join('; ') },
    ...(reportUri
      ? [
          {
            key: 'Reporting-Endpoints',
            value: `${REPORT_GROUP}="${reportUri}"`,
          },
        ]
      : []),
    { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
    { key: 'X-XSS-Protection', value: '0' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: buildSecurityHeaders() }];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
