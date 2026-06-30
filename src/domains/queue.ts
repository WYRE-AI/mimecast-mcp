/**
 * Queue domain handler
 *
 * Tools: get_queue_status
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient, type MimecastCredentials } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'mimecast_get_queue_status',
      description:
        'Get the current email delivery queue status from Mimecast, including counts and ages of queued inbound and outbound messages.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  _args: Record<string, unknown>,
  creds?: MimecastCredentials,
): Promise<CallToolResult> {
  const client = await getClient(creds);

  switch (toolName) {
    case 'mimecast_get_queue_status': {
      logger.info('API call: queue.getStatus');
      const status = await client.queue.getStatus();
      return {
        content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const queueHandler: DomainHandler = { getTools, handleCall };
