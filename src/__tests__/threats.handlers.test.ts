/**
 * Threats domain handler — request-shaping / response-mapping tests
 *
 * Invokes threatsHandler.handleCall() directly against a mocked node-mimecast
 * client for every exported tool, including the mimecast_get_ttp_logs
 * type-based dispatch branch (url / attachment / impersonation), which had
 * no coverage at all prior to this file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getIncidentsMock = vi.fn();
const getUrlLogsMock = vi.fn();
const getAttachmentLogsMock = vi.fn();
const getImpersonationLogsMock = vi.fn();
const getAuditEventsMock = vi.fn();

const mockInstance = {
  threats: {
    getIncidents: getIncidentsMock,
    getUrlLogs: getUrlLogsMock,
    getAttachmentLogs: getAttachmentLogsMock,
    getImpersonationLogs: getImpersonationLogsMock,
    getAuditEvents: getAuditEventsMock,
  },
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

import { threatsHandler } from '../domains/threats.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MIMECAST_CLIENT_ID = 'test-client-id';
  process.env.MIMECAST_CLIENT_SECRET = 'test-client-secret';
  process.env.MIMECAST_REGION = 'us';
});

describe('threatsHandler.handleCall', () => {
  describe('mimecast_get_threat_incidents', () => {
    it('maps args to the getIncidents() call shape and transforms the response', async () => {
      getIncidentsMock.mockResolvedValue([{ id: 'incident-001' }]);

      const result = await threatsHandler.handleCall('mimecast_get_threat_incidents', {
        status: 'open',
        page_size: 10,
        page_token: 'tok-1',
      });

      expect(getIncidentsMock).toHaveBeenCalledWith({
        status: 'open',
        pageSize: 10,
        pageToken: 'tok-1',
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        incidents: [{ id: 'incident-001' }],
        count: 1,
      });
    });

    it('defaults page_size to 50 when omitted', async () => {
      getIncidentsMock.mockResolvedValue([]);

      await threatsHandler.handleCall('mimecast_get_threat_incidents', {});

      expect(getIncidentsMock).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
    });

    it('normalizes a non-array API response to an empty list', async () => {
      getIncidentsMock.mockResolvedValue(undefined);

      const result = await threatsHandler.handleCall('mimecast_get_threat_incidents', {});

      expect(JSON.parse(result.content[0].text)).toEqual({ incidents: [], count: 0 });
    });

    it('propagates errors raised by the underlying client', async () => {
      getIncidentsMock.mockRejectedValue(new Error('incidents endpoint down'));

      await expect(
        threatsHandler.handleCall('mimecast_get_threat_incidents', {}),
      ).rejects.toThrow('incidents endpoint down');
    });
  });

  describe('mimecast_get_ttp_logs', () => {
    it('dispatches to getUrlLogs() for type=url with the mapped call shape', async () => {
      getUrlLogsMock.mockResolvedValue([{ id: 'url-1' }]);

      const result = await threatsHandler.handleCall('mimecast_get_ttp_logs', {
        type: 'url',
        from_date: '2026-01-01T00:00:00Z',
        to_date: '2026-01-02T00:00:00Z',
        page_size: 5,
        page_token: 'tok-2',
      });

      expect(getUrlLogsMock).toHaveBeenCalledWith({
        type: 'url',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
        pageSize: 5,
        pageToken: 'tok-2',
      });
      expect(getAttachmentLogsMock).not.toHaveBeenCalled();
      expect(getImpersonationLogsMock).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual({
        type: 'url',
        logs: [{ id: 'url-1' }],
        count: 1,
      });
    });

    it('dispatches to getAttachmentLogs() for type=attachment', async () => {
      getAttachmentLogsMock.mockResolvedValue([{ id: 'att-1' }]);

      const result = await threatsHandler.handleCall('mimecast_get_ttp_logs', {
        type: 'attachment',
      });

      expect(getAttachmentLogsMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'attachment' }),
      );
      expect(getUrlLogsMock).not.toHaveBeenCalled();
      expect(getImpersonationLogsMock).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual({
        type: 'attachment',
        logs: [{ id: 'att-1' }],
        count: 1,
      });
    });

    it('dispatches to getImpersonationLogs() for type=impersonation', async () => {
      getImpersonationLogsMock.mockResolvedValue([{ id: 'imp-1' }]);

      const result = await threatsHandler.handleCall('mimecast_get_ttp_logs', {
        type: 'impersonation',
      });

      expect(getImpersonationLogsMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'impersonation' }),
      );
      expect(getUrlLogsMock).not.toHaveBeenCalled();
      expect(getAttachmentLogsMock).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual({
        type: 'impersonation',
        logs: [{ id: 'imp-1' }],
        count: 1,
      });
    });

    it('normalizes a non-array API response to an empty list', async () => {
      getUrlLogsMock.mockResolvedValue(null);

      const result = await threatsHandler.handleCall('mimecast_get_ttp_logs', { type: 'url' });

      expect(JSON.parse(result.content[0].text)).toEqual({ type: 'url', logs: [], count: 0 });
    });

    it('propagates errors raised by the underlying client', async () => {
      getUrlLogsMock.mockRejectedValue(new Error('ttp logs unavailable'));

      await expect(
        threatsHandler.handleCall('mimecast_get_ttp_logs', { type: 'url' }),
      ).rejects.toThrow('ttp logs unavailable');
    });
  });

  describe('mimecast_get_audit_events', () => {
    it('maps args, including the categories array, to the getAuditEvents() call shape', async () => {
      getAuditEventsMock.mockResolvedValue([{ id: 'audit-001' }]);

      const result = await threatsHandler.handleCall('mimecast_get_audit_events', {
        from_date: '2026-01-01T00:00:00Z',
        to_date: '2026-01-02T00:00:00Z',
        categories: ['administration', 'policy'],
        page_size: 20,
        page_token: 'tok-3',
      });

      expect(getAuditEventsMock).toHaveBeenCalledWith({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
        categories: ['administration', 'policy'],
        pageSize: 20,
        pageToken: 'tok-3',
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        events: [{ id: 'audit-001' }],
        count: 1,
      });
    });

    it('normalizes a non-array API response to an empty list', async () => {
      getAuditEventsMock.mockResolvedValue([]);

      const result = await threatsHandler.handleCall('mimecast_get_audit_events', {});

      expect(JSON.parse(result.content[0].text)).toEqual({ events: [], count: 0 });
    });

    it('propagates errors raised by the underlying client', async () => {
      getAuditEventsMock.mockRejectedValue(new Error('audit endpoint down'));

      await expect(
        threatsHandler.handleCall('mimecast_get_audit_events', {}),
      ).rejects.toThrow('audit endpoint down');
    });
  });

  describe('unknown tool', () => {
    it('returns an isError result instead of throwing', async () => {
      const result = await threatsHandler.handleCall('mimecast_nonexistent', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });
});
