import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { parseMasterKey } from './src/lib/crypto/secret-store';
const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Local research data and master keys are runtime files, never deployment artifacts.
  outputFileTracingExcludes: {
    '*': [
      './data/**/*',
      './.env*',
      './test-results/**/*',
      './playwright-report/**/*',
      './modifvigne/**/*',
    ],
  },
  outputFileTracingIncludes: {
    '/*': ['./vendor/modifvigne-v3-4/**/*', './scripts/modifvigne-bridge.py'],
  },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};
export default function configure(phase: string): NextConfig {
  // An instrumentation rejection alone can leave Next listening after startup fails.
  // Validate before the production server starts accepting requests.
  if (phase === PHASE_PRODUCTION_SERVER) {
    if (!process.env.ROR_MASTER_KEY) throw new Error('Production requires a valid ROR_MASTER_KEY.');
    parseMasterKey(process.env.ROR_MASTER_KEY.trim());
  }
  return config;
}
