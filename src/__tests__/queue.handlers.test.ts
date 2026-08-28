/**
 * Queue domain handler — request-shaping / response-mapping tests
 *
 * Invokes queueHandler.handleCall() directly against a mocked node-mimecast
 * client so the (thin, but previously unexercised) status pass-through logic
 * is actually asserted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getStatusMock = vi.fn();

const mockInstance = {
  queue: {
    getStatus: getStatusMock,
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

import { queueHandler } from '../domains/queue.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MIMECAST_CLIENT_ID = 'test-client-id';
  process.env.MIMECAST_CLIENT_SECRET = 'test-client-secret';
  process.env.MIMECAST_REGION = 'us';
});

describe('queueHandler.handleCall', () => {
  describe('mimecast_get_queue_status', () => {
    it('calls getStatus() with no arguments and returns the raw payload', async () => {
      getStatusMock.mockResolvedValue({ inbound: { count: 5 }, outbound: { count: 2 } });

      const result = await queueHandler.handleCall('mimecast_get_queue_status', {});

      expect(getStatusMock).toHaveBeenCalledWith();
      expect(JSON.parse(result.content[0].text)).toEqual({
        inbound: { count: 5 },
        outbound: { count: 2 },
      });
    });

    it('ignores extraneous args (the tool takes none)', async () => {
      getStatusMock.mockResolvedValue({ inbound: { count: 0 }, outbound: { count: 0 } });

      await queueHandler.handleCall('mimecast_get_queue_status', { unexpected: 'value' });

      expect(getStatusMock).toHaveBeenCalledWith();
    });

    it('propagates errors raised by the underlying client', async () => {
      getStatusMock.mockRejectedValue(new Error('queue endpoint unavailable'));

      await expect(
        queueHandler.handleCall('mimecast_get_queue_status', {}),
      ).rejects.toThrow('queue endpoint unavailable');
    });
  });

  describe('unknown tool', () => {
    it('returns an isError result instead of throwing', async () => {
      const result = await queueHandler.handleCall('mimecast_nonexistent', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });
});
