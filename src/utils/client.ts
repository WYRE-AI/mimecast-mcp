/**
 * Mimecast client factory — request-scoped, no global singleton
 *
 * Credentials are resolved per-call in priority order:
 *   1. An explicit MimecastCredentials object (gateway / request-scoped)
 *   2. process.env MIMECAST_* vars (stdio / single-tenant env mode)
 *
 * process.env is never mutated by request handlers; callers pass credentials
 * directly to getClient() so concurrent requests cannot contaminate each other.
 */

import type { MimecastClient } from '@wyre-technology/node-mimecast';
import { logger } from './logger.js';

export interface MimecastCredentials {
  clientId: string;
  clientSecret: string;
  region: string;
  baseUrl: string;
}

/**
 * Mimecast regional base URLs
 */
const REGION_URLS: Record<string, string> = {
  us: 'https://api.services.mimecast.com',
  eu: 'https://eu-api.mimecast.com',
  de: 'https://de-api.mimecast.com',
  ca: 'https://ca-api.mimecast.com',
  za: 'https://za-api.mimecast.com',
  au: 'https://au-api.mimecast.com',
  offshore: 'https://offshore-api.mimecast.com',
  je: 'https://je-api.mimecast.com',
};

/**
 * Build a MimecastCredentials object from raw field values.
 * Returns null when required fields (clientId, clientSecret) are absent.
 */
export function buildCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined,
  region?: string | undefined,
): MimecastCredentials | null {
  if (!clientId || !clientSecret) return null;
  const r = (region || 'us').toLowerCase();
  return { clientId, clientSecret, region: r, baseUrl: REGION_URLS[r] ?? REGION_URLS['us'] };
}

/**
 * Read credentials from environment variables.
 * Used by stdio / single-tenant deployments; never called during gateway requests.
 */
export function getCredentials(): MimecastCredentials | null {
  const creds = buildCredentials(
    process.env.MIMECAST_CLIENT_ID,
    process.env.MIMECAST_CLIENT_SECRET,
    process.env.MIMECAST_REGION,
  );
  if (!creds) {
    logger.warn('Missing Mimecast credentials', {
      hasClientId: !!process.env.MIMECAST_CLIENT_ID,
      hasClientSecret: !!process.env.MIMECAST_CLIENT_SECRET,
    });
  }
  return creds;
}

/**
 * Construct a Mimecast client from the supplied credentials.
 *
 * When `credsOverride` is provided (gateway / request-scoped mode) it is used
 * directly and process.env is never consulted. When omitted the function falls
 * back to getCredentials() (env / stdio mode).
 *
 * A new client instance is created for every call — MimecastClient is cheap
 * and holds no shared mutable state, so there is no benefit to caching across
 * requests (which would reintroduce the cross-tenant leak risk).
 */
export async function getClient(credsOverride?: MimecastCredentials): Promise<MimecastClient> {
  const creds = credsOverride ?? getCredentials();

  if (!creds) {
    throw new Error(
      'No Mimecast credentials configured. ' +
      'Set MIMECAST_CLIENT_ID, MIMECAST_CLIENT_SECRET, and optionally MIMECAST_REGION.',
    );
  }

  const { MimecastClient } = await import('@wyre-technology/node-mimecast');
  logger.info('Creating Mimecast client', { region: creds.region, baseUrl: creds.baseUrl });
  return new MimecastClient({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    baseUrl: creds.baseUrl,
  });
}

/**
 * No-op kept for test compatibility — no singleton to clear.
 * @deprecated Tests should no longer rely on a module-level singleton.
 */
export function clearClient(): void {
  // intentional no-op: there is no shared client to clear
}
