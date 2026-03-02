/**
 * Threats domain handler
 *
 * Tools: get_threat_incidents, get_ttp_logs, get_audit_events
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'mimecast_get_threat_incidents',
      description:
        'Get threat remediation incidents from Mimecast. Returns incidents where malicious content was detected and remediation actions were taken.',
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
        'Get Targeted Threat Protection logs. Retrieve URL click logs, attachment sandbox results, or impersonation protection hits.',
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
            description: 'Start date-time in ISO 8601 format',
          },
          to_date: {
            type: 'string',
            description: 'End date-time in ISO 8601 format',
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
        'Retrieve Mimecast audit log entries. Useful for compliance reviews and investigating administrative changes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          from_date: {
            type: 'string',
            description: 'Start date-time in ISO 8601 format',
          },
          to_date: {
            type: 'string',
            description: 'End date-time in ISO 8601 format',
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by event categories (e.g. ["administration", "policy"])',
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
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

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
        from: args.from_date as string | undefined,
        to: args.to_date as string | undefined,
        pageSize: (args.page_size as number) || 50,
        pageToken: args.page_token as string | undefined,
      };

      let logs: unknown[];
      if (type === 'url') {
        logs = await client.threats.getUrlLogs(params);
      } else if (type === 'attachment') {
        logs = await client.threats.getAttachmentLogs(params);
      } else {
        logs = await client.threats.getImpersonationLogs(params);
      }

      const result = Array.isArray(logs) ? logs : [];
      return {
        content: [{ type: 'text', text: JSON.stringify({ type, logs: result, count: result.length }, null, 2) }],
      };
    }

    case 'mimecast_get_audit_events': {
      logger.info('API call: threats.getAuditEvents', { from: args.from_date, to: args.to_date });
      const events = await client.threats.getAuditEvents({
        from: args.from_date as string | undefined,
        to: args.to_date as string | undefined,
        categories: args.categories as string[] | undefined,
        pageSize: (args.page_size as number) || 50,
        pageToken: args.page_token as string | undefined,
      });
      const result = Array.isArray(events) ? events : [];
      return {
        content: [{ type: 'text', text: JSON.stringify({ events: result, count: result.length }, null, 2) }],
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
