/**
 * TTP log endpoints return one wrapper object inside `data`, for example
 * `{ clickLogs: [...] }`. The client surfaces that wrapper (data[0]) rather
 * than the inner list. An empty log array is a real result. A wrapper whose
 * log field is missing or not an array is a bad payload and must not be
 * reported as "no logs".
 */

const NESTED_LOG_KEYS = ['clickLogs', 'attachmentLogs', 'impersonationLogs'] as const;

export function asLogList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value !== 'object') {
    throw new Error('TTP log response was not a list or a log wrapper.');
  }

  const record = value as Record<string, unknown>;
  const present = NESTED_LOG_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (present.length === 0) {
    throw new Error(
      'TTP log response is missing clickLogs, attachmentLogs, or impersonationLogs.',
    );
  }

  for (const key of present) {
    if (!Array.isArray(record[key])) {
      throw new Error(`TTP log response field ${key} is not an array.`);
    }
  }

  return record[present[0]] as unknown[];
}
