/**
 * TTP log endpoints return one wrapper object inside `data`, for example
 * `{ clickLogs: [...] }`. The client surfaces that wrapper (data[0]) rather
 * than the inner list. Treating a non-array as "no results" drops every hit.
 */

const NESTED_LOG_KEYS = ['clickLogs', 'attachmentLogs', 'impersonationLogs'] as const;

export function asLogList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of NESTED_LOG_KEYS) {
      const nested = record[key];
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}
