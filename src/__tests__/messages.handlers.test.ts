/**
 * Messages domain handler — request-shaping / response-mapping tests
 *
 * client.test.ts and mcp-apps.test.ts already exercise getCredentials() and
 * the message-card path of mimecast_get_message_info. This file closes the
 * remaining gap: invoking messagesHandler.handleCall() directly for every
 * exported tool, asserting both the outbound call shape sent to
 * node-mimecast and the response transformation returned to the caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMock = vi.fn();
const getInfoMock = vi.fn();
const holdMock = vi.fn();
const releaseMock = vi.fn();

const mockInstance = {
  messages: {
    find: findMock,
    getInfo: getInfoMock,
    hold: holdMock,
    release: releaseMock,
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

import { messagesHandler } from '../domains/messages.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MIMECAST_CLIENT_ID = 'test-client-id';
  process.env.MIMECAST_CLIENT_SECRET = 'test-client-secret';
  process.env.MIMECAST_REGION = 'us';
});

describe('messagesHandler.handleCall', () => {
  describe('mimecast_find_message', () => {
    it('maps snake_case args to the find() call shape', async () => {
      findMock.mockResolvedValue([{ id: 'msg-001', status: 'delivered' }]);

      const result = await messagesHandler.handleCall('mimecast_find_message', {
        value: 'invoice',
        sender_address: 'a@example.com',
        recipient_address: 'b@example.com',
        from_date: '2026-01-01T00:00:00Z',
        to_date: '2026-01-02T00:00:00Z',
        status: 'delivered',
        page_size: 25,
        page_token: 'tok-1',
      });

      expect(findMock).toHaveBeenCalledWith({
        value: 'invoice',
        senderAddress: 'a@example.com',
        recipientAddress: 'b@example.com',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
        messageStatus: 'delivered',
        pageSize: 25,
        pageToken: 'tok-1',
      });

      const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;
      expect(payload).toEqual({ messages: [{ id: 'msg-001', status: 'delivered' }], count: 1 });
    });

    it('defaults page_size to 50 when omitted', async () => {
      findMock.mockResolvedValue([]);

      await messagesHandler.handleCall('mimecast_find_message', {});

      expect(findMock).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 50 }));
    });

    it('normalizes a non-array API response to an empty list', async () => {
      findMock.mockResolvedValue(null);

      const result = await messagesHandler.handleCall('mimecast_find_message', {});

      expect(JSON.parse(result.content[0].text)).toEqual({ messages: [], count: 0 });
    });

    it('propagates errors raised by the underlying client', async () => {
      findMock.mockRejectedValue(new Error('mimecast api unavailable'));

      await expect(
        messagesHandler.handleCall('mimecast_find_message', {}),
      ).rejects.toThrow('mimecast api unavailable');
    });
  });

  describe('mimecast_get_message_info', () => {
    it('passes id through to getInfo() unchanged', async () => {
      getInfoMock.mockResolvedValue({ id: 'msg-001', status: 'held' });

      await messagesHandler.handleCall('mimecast_get_message_info', { id: 'msg-001' });

      expect(getInfoMock).toHaveBeenCalledWith('msg-001');
    });
  });

  describe('mimecast_hold_message', () => {
    it('passes id and reason through to hold()', async () => {
      holdMock.mockResolvedValue({ success: true, id: 'msg-001' });

      const result = await messagesHandler.handleCall('mimecast_hold_message', {
        id: 'msg-001',
        reason: 'suspicious link',
      });

      expect(holdMock).toHaveBeenCalledWith('msg-001', 'suspicious link');
      expect(JSON.parse(result.content[0].text)).toEqual({ success: true, id: 'msg-001' });
    });

    it('passes an undefined reason through when omitted', async () => {
      holdMock.mockResolvedValue({ success: true, id: 'msg-001' });

      await messagesHandler.handleCall('mimecast_hold_message', { id: 'msg-001' });

      expect(holdMock).toHaveBeenCalledWith('msg-001', undefined);
    });

    it('propagates errors raised by the underlying client', async () => {
      holdMock.mockRejectedValue(new Error('hold failed'));

      await expect(
        messagesHandler.handleCall('mimecast_hold_message', { id: 'msg-001' }),
      ).rejects.toThrow('hold failed');
    });
  });

  describe('mimecast_release_message', () => {
    it('passes id through to release() and returns the raw result', async () => {
      releaseMock.mockResolvedValue({ success: true, id: 'msg-001' });

      const result = await messagesHandler.handleCall('mimecast_release_message', {
        id: 'msg-001',
      });

      expect(releaseMock).toHaveBeenCalledWith('msg-001');
      expect(JSON.parse(result.content[0].text)).toEqual({ success: true, id: 'msg-001' });
    });

    it('propagates errors raised by the underlying client', async () => {
      releaseMock.mockRejectedValue(new Error('release failed'));

      await expect(
        messagesHandler.handleCall('mimecast_release_message', { id: 'msg-001' }),
      ).rejects.toThrow('release failed');
    });
  });

  describe('unknown tool', () => {
    it('returns an isError result instead of throwing', async () => {
      const result = await messagesHandler.handleCall('mimecast_nonexistent', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });
});
