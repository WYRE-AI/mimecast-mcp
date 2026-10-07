/**
 * Mimecast API 1.0/2.0 date fields reject a trailing Z. The documented
 * form is UTC with an explicit offset, for example 2011-12-03T10:15:30+0000.
 */

const AUDIT_DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AUDIT_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Display names previously shown in tool descriptions, mapped to the `code`
 * values returned by /api/audit/get-categories. Unknown values pass through.
 */
const AUDIT_CATEGORY_ALIASES: Record<string, string> = {
  administration: 'account_logs',
  admin: 'account_logs',
  account: 'account_logs',
  policy: 'policy_logs',
  authentication: 'authentication_logs',
  auth: 'authentication_logs',
  archive: 'archive_service_logs',
  journaling: 'journaling_logs',
  branding: 'branding_logs',
  awareness: 'awareness_training_logs',
  reporting: 'reporting_logs',
  integrations: 'integrations_and_apis',
  continuity: 'continuity_services_logs',
};

export function formatMimecastDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}+0000`;
}

export function toMimecastDateTime(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Date value is empty. Use ISO 8601, for example 2026-03-01T00:00:00+0000.');
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid date "${input}". Use ISO 8601, for example 2026-03-01T00:00:00+0000.`,
    );
  }
  return formatMimecastDateTime(parsed);
}

/**
 * Normalize an optional tool date. Undefined stays undefined so endpoints
 * that treat the field as optional keep their server-side default.
 */
export function optionalMimecastDateTime(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.trim() === '') return undefined;
  return toMimecastDateTime(input);
}

/**
 * /api/audit/get-audit-events requires startDateTime and endDateTime, and
 * only retains 60 days. Omitting them makes Mimecast return an empty `data`
 * array (often with a fail entry the client does not surface).
 */
export function resolveAuditWindow(
  from: unknown,
  to: unknown,
  now: Date = new Date(),
): { from: string; to: string } {
  const end = optionalMimecastDateTime(to) ?? formatMimecastDateTime(now);
  const start =
    optionalMimecastDateTime(from) ??
    formatMimecastDateTime(new Date(now.getTime() - AUDIT_DEFAULT_WINDOW_MS));

  const startMs = Date.parse(start.replace('+0000', 'Z'));
  const endMs = Date.parse(end.replace('+0000', 'Z'));
  if (endMs < startMs) {
    throw new Error(`Audit end ${end} is before start ${start}.`);
  }
  if (startMs < now.getTime() - AUDIT_MAX_AGE_MS) {
    throw new Error(
      `Audit history is limited to the last 60 days (start ${start} is older than that). Narrow from_date.`,
    );
  }
  return { from: start, to: end };
}

export function normalizeAuditCategories(categories: unknown): string[] | undefined {
  if (!Array.isArray(categories) || categories.length === 0) return undefined;
  return categories.map((value) => {
    const raw = String(value).trim();
    return AUDIT_CATEGORY_ALIASES[raw.toLowerCase()] ?? raw;
  });
}
