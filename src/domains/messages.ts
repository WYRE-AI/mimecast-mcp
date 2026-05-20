/**
 * Messages domain handler
 *
 * Tools: find_message, get_message_info, hold_message, release_message
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

/** Mirrors the `messageStatus` union accepted by node-mimecast's messages.find(). */
type MessageStatus =
  | 'accepted' | 'blocked' | 'bounced' | 'deferred' | 'delivered'
  | 'failed' | 'held' | 'processing' | 'queued';

function getTools(): Tool[] {
  return [
    {
      name: 'mimecast_find_message',
      description:
        'Search for email messages using Mimecast message tracking. Filter by sender, recipient, subject, date range, or delivery status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          value: {
            type: 'string',
            description: 'Keyword search across message fields',
          },
          sender_address: {
            type: 'string',
            description: 'Filter by sender email address',
          },
          recipient_address: {
            type: 'string',
            description: 'Filter by recipient email address',
          },
          from_date: {
            type: 'string',
            description: 'Start date-time in ISO 8601 format (e.g. 2026-03-01T00:00:00Z)',
          },
          to_date: {
            type: 'string',
            description: 'End date-time in ISO 8601 format',
          },
          status: {
            type: 'string',
            enum: ['accepted', 'blocked', 'bounced', 'deferred', 'delivered', 'failed', 'held', 'processing', 'queued'],
            description: 'Filter by message delivery status',
          },
          page_size: {
            type: 'number',
            description: 'Number of results to return (default: 50, max: 100)',
          },
          page_token: {
            type: 'string',
            description: 'Pagination token for next page',
          },
        },
      },
    },
    {
      name: 'mimecast_get_message_info',
      description:
        'Get detailed metadata for a specific message by its Mimecast ID, including headers, routing information, and rejection details.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'Mimecast message ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'mimecast_hold_message',
      description:
        'Place a message on hold in the Mimecast gateway to prevent delivery while under review.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'Mimecast message ID to hold',
          },
          reason: {
            type: 'string',
            description: 'Reason for holding the message',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'mimecast_release_message',
      description:
        'Release a held message from the Mimecast gateway to allow delivery to the recipient.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'Mimecast message ID to release',
          },
        },
        required: ['id'],
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
    case 'mimecast_find_message': {
      const pageSize = (args.page_size as number) || 50;
      logger.info('API call: messages.find', {
        senderAddress: args.sender_address,
        recipientAddress: args.recipient_address,
        pageSize,
      });
      const messages = await client.messages.find({
        value: args.value as string | undefined,
        senderAddress: args.sender_address as string | undefined,
        recipientAddress: args.recipient_address as string | undefined,
        from: args.from_date as string | undefined,
        to: args.to_date as string | undefined,
        messageStatus: args.status as MessageStatus | undefined,
        pageSize,
        pageToken: args.page_token as string | undefined,
      });
      const result = Array.isArray(messages) ? messages : [];
      return {
        content: [{ type: 'text', text: JSON.stringify({ messages: result, count: result.length }, null, 2) }],
      };
    }

    case 'mimecast_get_message_info': {
      const id = args.id as string;
      logger.info('API call: messages.getInfo', { id });
      const info = await client.messages.getInfo(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
      };
    }

    case 'mimecast_hold_message': {
      const id = args.id as string;
      const reason = args.reason as string | undefined;
      logger.info('API call: messages.hold', { id, reason });
      const result = await client.messages.hold(id, reason);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'mimecast_release_message': {
      const id = args.id as string;
      logger.info('API call: messages.release', { id });
      const result = await client.messages.release(id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const messagesHandler: DomainHandler = { getTools, handleCall };
