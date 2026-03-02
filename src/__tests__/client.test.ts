import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the node-mimecast package
vi.mock('@wyre-technology/node-mimecast', () => ({
  MimecastClient: vi.fn().mockImplementation(() => ({
    messages: {
      find: vi.fn().mockResolvedValue([{ id: 'msg-001', status: 'delivered' }]),
      getInfo: vi.fn().mockResolvedValue({ id: 'msg-001', status: 'delivered' }),
      hold: vi.fn().mockResolvedValue({ success: true, id: 'msg-001' }),
      release: vi.fn().mockResolvedValue({ success: true, id: 'msg-001' }),
    },
    threats: {
      getIncidents: vi.fn().mockResolvedValue([{ id: 'incident-001' }]),
      getUrlLogs: vi.fn().mockResolvedValue([]),
      getAttachmentLogs: vi.fn().mockResolvedValue([]),
      getImpersonationLogs: vi.fn().mockResolvedValue([]),
      getAuditEvents: vi.fn().mockResolvedValue([{ id: 'audit-001' }]),
    },
    queue: {
      getStatus: vi.fn().mockResolvedValue({ inbound: { count: 5 }, outbound: { count: 2 } }),
    },
  })),
}));

describe('Client utility', () => {
  beforeEach(() => {
    // Set test credentials
    process.env.MIMECAST_CLIENT_ID = 'test-client-id';
    process.env.MIMECAST_CLIENT_SECRET = 'test-client-secret';
    process.env.MIMECAST_REGION = 'us';
  });

  it('getCredentials returns credentials when env vars are set', async () => {
    const { getCredentials } = await import('../utils/client.js');
    const creds = getCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.clientId).toBe('test-client-id');
    expect(creds?.region).toBe('us');
  });

  it('getCredentials returns null when env vars are missing', async () => {
    const savedId = process.env.MIMECAST_CLIENT_ID;
    delete process.env.MIMECAST_CLIENT_ID;

    const { getCredentials, clearClient } = await import('../utils/client.js');
    clearClient();
    const creds = getCredentials();
    expect(creds).toBeNull();

    process.env.MIMECAST_CLIENT_ID = savedId;
  });
});
