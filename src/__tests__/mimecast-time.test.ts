import { describe, expect, it } from 'vitest';
import { asLogList } from '../utils/log-list.js';
import {
  normalizeAuditCategories,
  resolveAuditWindow,
  toMimecastDateTime,
} from '../utils/mimecast-time.js';

describe('toMimecastDateTime', () => {
  it('converts a trailing Z to the +0000 offset Mimecast documents', () => {
    expect(toMimecastDateTime('2026-09-01T00:00:00Z')).toBe('2026-09-01T00:00:00+0000');
  });

  it('keeps an instant that is already expressed with an offset', () => {
    expect(toMimecastDateTime('2026-09-01T01:30:00+0000')).toBe('2026-09-01T01:30:00+0000');
  });

  it('rejects a value that is not a date', () => {
    expect(() => toMimecastDateTime('not-a-date')).toThrow(/Invalid date/);
  });
});

describe('resolveAuditWindow', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('fills the last 7 days when both bounds are omitted', () => {
    expect(resolveAuditWindow(undefined, undefined, now)).toEqual({
      from: '2026-09-30T12:00:00+0000',
      to: '2026-10-07T12:00:00+0000',
    });
  });

  it('rejects a start older than 60 days', () => {
    expect(() => resolveAuditWindow('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', now)).toThrow(
      /60 days/,
    );
  });
});

describe('normalizeAuditCategories', () => {
  it('maps the display names previously advertised by the tool schema', () => {
    expect(normalizeAuditCategories(['administration', 'policy'])).toEqual([
      'account_logs',
      'policy_logs',
    ]);
  });

  it('leaves official codes unchanged and drops an empty list', () => {
    expect(normalizeAuditCategories(['account_logs'])).toEqual(['account_logs']);
    expect(normalizeAuditCategories([])).toBeUndefined();
    expect(normalizeAuditCategories(undefined)).toBeUndefined();
  });
});

describe('asLogList', () => {
  it('returns an array unchanged', () => {
    expect(asLogList([{ url: 'https://example.test' }])).toEqual([{ url: 'https://example.test' }]);
  });

  it('unwraps the clickLogs object Mimecast puts in data[0]', () => {
    expect(asLogList({ clickLogs: [{ url: 'https://example.test' }] })).toEqual([
      { url: 'https://example.test' },
    ]);
  });

  it('returns an empty list for null and for an object with no log array', () => {
    expect(asLogList(null)).toEqual([]);
    expect(asLogList({ status: 200 })).toEqual([]);
  });
});
