/**
 * Threats domain handler
 *
 * Tools: get_threat_incidents, get_ttp_logs, get_audit_events
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient, type MimecastCredentials } from '../utils/client.js';
import { asLogList } from '../utils/log-list.js';
import { logger } from '../utils/logger.js';
import {
  normalizeAuditCategories,
  optionalMimecastDateTime,
  resolveAuditWindow,
} from '../utils/mimecast-time.js';

function getTools(): Tool[] {
  return [
    {
      name: 'mimecast_get_threat_incidents',
      description:
        'Get threat remediation incidents from Mimecast. Returns incidents where malicious content was detected and remediation actions were taken. Requires the API application role permission Services | Threat Remediation | Read; a permissions error means that permission is missing.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          status: {
            type: 'string',
            description: 'Filter by incident status (e.g. open, closed)',
          },
          page_size: {
            type: 'number',
            description: 'Number of results (default: 50)',
          },
          page_token: {
            type: 'string',
            description: 'Pagination token for next page',
          },
        },
      },
    },
    {
      name: 'mimecast_get_ttp_logs',
      description:
        'Get Targeted Threat Protection logs. Retrieve URL click logs, attachment sandbox results, or impersonation protection hits. Requires Monitoring | URL Protection | Read, Monitoring | Attachment Protection | Read, or Monitoring | Impersonation Protection | Read, matching type. Dates use ISO 8601 (2026-03-01T00:00:00+0000 or a trailing Z).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['url', 'attachment', 'impersonation'],
            description: 'Type of TTP log to retrieve',
          },
          from_date: {
            type: 'string',
            description:
              'Start date-time in ISO 8601 UTC (2026-03-01T00:00:00+0000). A trailing Z is accepted and converted. Omit to use Mimecast\'s default (start of the current day).',
          },
          to_date: {
            type: 'string',
            description:
              'End date-time in ISO 8601 UTC (2026-03-01T00:00:00+0000). A trailing Z is accepted and converted.',
          },
          page_size: {
            type: 'number',
            description: 'Number of results (default: 50)',
          },
          page_token: {
            type: 'string',
            description: 'Pagination token for next page',
          },
        },
        required: ['type'],
      },
    },
    {
      name: 'mimecast_get_audit_events',
      description:
        'Retrieve Mimecast audit log entries. Useful for compliance reviews and investigating administrative changes. The API requires a start and end; when omitted, the last 7 days are used. History is limited to 60 days. Requires Account | Logs | Read. Category filters use codes such as account_logs or policy_logs (not display names); omit categories to return every category.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          from_date: {
            type: 'string',
            description:
              'Start date-time in ISO 8601 UTC (2026-03-01T00:00:00+0000). A trailing Z is accepted. Must be within the last 60 days. Defaults to 7 days before to_date.',
          },
          to_date: {
            type: 'string',
            description:
              'End date-time in ISO 8601 UTC (2026-03-01T00:00:00+0000). A trailing Z is accepted. Defaults to now.',
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Audit category codes from /api/audit/get-categories, for example ["account_logs", "policy_logs"]. Omit to return every category. Display names such as "administration" are mapped to account_logs.',
          },
          page_size: {
            type: 'number',
            description: 'Number of results (default: 50)',
          },
          page_token: {
            type: 'string',
            description: 'Pagination token for next page',
          },
        },
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>,
  creds?: MimecastCredentials,
): Promise<CallToolResult> {
  const client = await getClient(creds);

  switch (toolName) {
    case 'mimecast_get_threat_incidents': {
      logger.info('API call: threats.getIncidents', { status: args.status });
      const incidents = await client.threats.getIncidents({
        status: args.status as string | undefined,
        pageSize: (args.page_size as number) || 50,
        pageToken: args.page_token as string | undefined,
      });
      const result = Array.isArray(incidents) ? incidents : [];
      return {
        content: [{ type: 'text', text: JSON.stringify({ incidents: result, count: result.length }, null, 2) }],
      };
    }

    case 'mimecast_get_ttp_logs': {
      const type = args.type as 'url' | 'attachment' | 'impersonation';
      logger.info('API call: threats.getTtpLogs', { type });

      const params = {
        type,
        from: optionalMimecastDateTime(args.from_date),
        to: optionalMimecastDateTime(args.to_date),
        pageSize: (args.page_size as number) || 50,
        pageToken: args.page_token as string | undefined,
      };

      let logs: unknown;
      if (type === 'url') {
        logs = await client.threats.getUrlLogs(params);
      } else if (type === 'attachment') {
        logs = await client.threats.getAttachmentLogs(params);
      } else {
        logs = await client.threats.getImpersonationLogs(params);
      }

      // URL/attachment/impersonation responses nest the rows under
      // clickLogs / attachmentLogs / impersonationLogs. A bare object here
      // is that wrapper, not "no data".
      const result = asLogList(logs);
      return {
        content: [{ type: 'text', text: JSON.stringify({ type, logs: result, count: result.length }, null, 2) }],
      };
    }

    case 'mimecast_get_audit_events': {
      const auditWindow = resolveAuditWindow(args.from_date, args.to_date);
      const categories = normalizeAuditCategories(args.categories);
      logger.info('API call: threats.getAuditEvents', { from: auditWindow.from, to: auditWindow.to });
      const events = await client.threats.getAuditEvents({
        from: auditWindow.from,
        to: auditWindow.to,
        categories,
        pageSize: (args.page_size as number) || 50,
        pageToken: args.page_token as string | undefined,
      });
      const result = Array.isArray(events) ? events : [];
      const payload: Record<string, unknown> = {
        events: result,
        count: result.length,
        from: auditWindow.from,
        to: auditWindow.to,
      };
      if (result.length === 0) {
        payload.hint =
          'No audit events in this window. The API application needs Account | Logs | Read, and history only covers the last 60 days. Omit categories to search every log, or use codes such as account_logs and policy_logs.';
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const threatsHandler: DomainHandler = { getTools, handleCall };
