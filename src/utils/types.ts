/**
 * Shared types for the Mimecast MCP server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type DomainName = 'messages' | 'threats' | 'queue';

export type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface DomainHandler {
  getTools(): Tool[];
  handleCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult>;
}

export function isDomainName(value: string): value is DomainName {
  return ['messages', 'threats', 'queue'].includes(value);
}
