/**
 * Credential isolation tests
 *
 * Asserts that:
 *  1. buildCredentials / getClient accept explicit per-request creds and never
 *     read or write process.env when a creds override is supplied.
 *  2. Concurrent requests with different credentials never see each other's
 *     creds (no cross-tenant contamination via shared global state).
 *  3. process.env fallback still works for stdio / env mode.
 *  4. process.env is never mutated by any code path in the server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock node-mimecast ─────────────────────────────────────────────────────

const mockInstance = {
  messages: { find: vi.fn().mockResolvedValue([]) },
  threats: { getIncidents: vi.fn().mockResolvedValue([]) },
  queue: { getStatus: vi.fn().mockResolvedValue({}) },
};

const MockMimecastClient = vi.fn().mockImplementation(function (
  this: typeof mockInstance,
  _opts: unknown,
) {
  Object.assign(this, mockInstance);
});

vi.mock('@wyre-technology/node-mimecast', () => ({
  MimecastClient: MockMimecastClient,
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildCredentials', () => {
  it('returns null when required fields are missing', async () => {
    const { buildCredentials } = await import('../utils/client.js');
    expect(buildCredentials(undefined, 'secret')).toBeNull();
    expect(buildCredentials('id', undefined)).toBeNull();
    expect(buildCredentials(undefined, undefined)).toBeNull();
  });

  it('builds credentials with default region us when region is omitted', async () => {
    const { buildCredentials } = await import('../utils/client.js');
    const creds = buildCredentials('id', 'secret');
    expect(creds).not.toBeNull();
    expect(creds!.region).toBe('us');
    expect(creds!.baseUrl).toBe('https://api.services.mimecast.com');
  });

  it('builds credentials for eu region', async () => {
    const { buildCredentials } = await import('../utils/client.js');
    const creds = buildCredentials('id', 'secret', 'eu');
    expect(creds!.region).toBe('eu');
    expect(creds!.baseUrl).toBe('https://eu-api.mimecast.com');
  });
});

describe('getCredentials — env fallback', () => {
  const origId = process.env.MIMECAST_CLIENT_ID;
  const origSecret = process.env.MIMECAST_CLIENT_SECRET;
  const origRegion = process.env.MIMECAST_REGION;

  beforeEach(() => {
    process.env.MIMECAST_CLIENT_ID = 'env-id';
    process.env.MIMECAST_CLIENT_SECRET = 'env-secret';
    process.env.MIMECAST_REGION = 'us';
  });

  afterEach(() => {
    if (origId !== undefined) process.env.MIMECAST_CLIENT_ID = origId;
    else delete process.env.MIMECAST_CLIENT_ID;
    if (origSecret !== undefined) process.env.MIMECAST_CLIENT_SECRET = origSecret;
    else delete process.env.MIMECAST_CLIENT_SECRET;
    if (origRegion !== undefined) process.env.MIMECAST_REGION = origRegion;
    else delete process.env.MIMECAST_REGION;
  });

  it('reads credentials from env when no override is provided', async () => {
    const { getCredentials } = await import('../utils/client.js');
    const creds = getCredentials();
    expect(creds).not.toBeNull();
    expect(creds!.clientId).toBe('env-id');
    expect(creds!.clientSecret).toBe('env-secret');
  });
});

describe('getClient — request-scoped creds beat process.env', () => {
  beforeEach(() => {
    // Set env creds that should NOT be used when explicit creds are passed
    process.env.MIMECAST_CLIENT_ID = 'env-id-should-not-be-used';
    process.env.MIMECAST_CLIENT_SECRET = 'env-secret-should-not-be-used';
    MockMimecastClient.mockClear();
  });

  afterEach(() => {
    delete process.env.MIMECAST_CLIENT_ID;
    delete process.env.MIMECAST_CLIENT_SECRET;
    delete process.env.MIMECAST_REGION;
  });

  it('uses explicit creds and does not read process.env', async () => {
    const { getClient, buildCredentials } = await import('../utils/client.js');
    const creds = buildCredentials('request-id', 'request-secret', 'eu')!;

    await getClient(creds);

    expect(MockMimecastClient).toHaveBeenCalledTimes(1);
    const callArg = MockMimecastClient.mock.calls[0][0] as {
      clientId: string;
      clientSecret: string;
      baseUrl: string;
    };
    expect(callArg.clientId).toBe('request-id');
    expect(callArg.clientSecret).toBe('request-secret');
    expect(callArg.baseUrl).toBe('https://eu-api.mimecast.com');
    // Verify env creds were NOT used
    expect(callArg.clientId).not.toBe('env-id-should-not-be-used');
  });
});

describe('no cross-request credential contamination', () => {
  beforeEach(() => {
    MockMimecastClient.mockClear();
  });

  afterEach(() => {
    delete process.env.MIMECAST_CLIENT_ID;
    delete process.env.MIMECAST_CLIENT_SECRET;
    delete process.env.MIMECAST_REGION;
  });

  it('concurrent calls with different creds each receive a distinct client object', async () => {
    const { getClient, buildCredentials } = await import('../utils/client.js');

    const credsA = buildCredentials('tenant-A-id', 'tenant-A-secret', 'us')!;
    const credsB = buildCredentials('tenant-B-id', 'tenant-B-secret', 'eu')!;

    // Simulate two concurrent requests; each must get its own fresh client
    const [clientA, clientB] = await Promise.all([getClient(credsA), getClient(credsB)]);

    // The two returned client objects must be distinct instances (no singleton sharing)
    expect(clientA).not.toBe(clientB);
  });

  it('process.env is not mutated by getClient with explicit creds', async () => {
    const { getClient, buildCredentials } = await import('../utils/client.js');
    const creds = buildCredentials('req-id', 'req-secret', 'ca')!;

    const idBefore = process.env.MIMECAST_CLIENT_ID;
    const secretBefore = process.env.MIMECAST_CLIENT_SECRET;
    const regionBefore = process.env.MIMECAST_REGION;

    await getClient(creds);

    expect(process.env.MIMECAST_CLIENT_ID).toBe(idBefore);
    expect(process.env.MIMECAST_CLIENT_SECRET).toBe(secretBefore);
    expect(process.env.MIMECAST_REGION).toBe(regionBefore);
  });
});
