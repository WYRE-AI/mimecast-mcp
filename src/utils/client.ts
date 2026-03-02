/**
 * Lazy-loaded Mimecast client singleton
 *
 * In gateway mode (AUTH_MODE=gateway), credentials come from request headers
 * injected into env vars by the HTTP handler before each MCP request.
 */

import type { MimecastClient } from '@wyre-technology/node-mimecast';
import { logger } from './logger.js';

export interface MimecastCredentials {
  clientId: string;
  clientSecret: string;
  region: string;
  baseUrl: string;
}

let _client: MimecastClient | null = null;
let _credentials: MimecastCredentials | null = null;

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
 * Read credentials from environment variables
 */
export function getCredentials(): MimecastCredentials | null {
  const clientId = process.env.MIMECAST_CLIENT_ID;
  const clientSecret = process.env.MIMECAST_CLIENT_SECRET;
  const region = (process.env.MIMECAST_REGION || 'us').toLowerCase();

  if (!clientId || !clientSecret) {
    logger.warn('Missing Mimecast credentials', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  const baseUrl = REGION_URLS[region] ?? REGION_URLS['us'];

  return { clientId, clientSecret, region, baseUrl };
}

/**
 * Get or create the Mimecast client (lazy initialization with credential change detection)
 */
export async function getClient(): Promise<MimecastClient> {
  const creds = getCredentials();

  if (!creds) {
    throw new Error(
      'No Mimecast credentials configured. ' +
      'Set MIMECAST_CLIENT_ID, MIMECAST_CLIENT_SECRET, and optionally MIMECAST_REGION.'
    );
  }

  // Invalidate cached client if credentials changed
  if (
    _client &&
    _credentials &&
    (creds.clientId !== _credentials.clientId ||
      creds.clientSecret !== _credentials.clientSecret ||
      creds.region !== _credentials.region)
  ) {
    logger.info('Credentials changed — recreating Mimecast client');
    _client = null;
  }

  if (!_client) {
    const { MimecastClient } = await import('@wyre-technology/node-mimecast');
    logger.info('Creating Mimecast client', { region: creds.region, baseUrl: creds.baseUrl });
    _client = new MimecastClient({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      baseUrl: creds.baseUrl,
    });
    _credentials = creds;
  }

  return _client;
}

/**
 * Clear the cached client (useful for testing)
 */
export function clearClient(): void {
  _client = null;
  _credentials = null;
}
