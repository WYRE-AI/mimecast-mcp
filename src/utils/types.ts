/**
 * Shared types for the Mimecast MCP server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MimecastCredentials } from './client.js';

export type DomainName = 'messages' | 'threats' | 'queue';

export type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface DomainHandler {
  getTools(): Tool[];
  /**
   * Handle a tool call.
   *
   * @param toolName - The tool to invoke.
   * @param args     - Tool arguments.
   * @param creds    - Per-request credentials (gateway mode). When omitted the
   *                   handler falls back to process.env (stdio / env mode).
   */
  handleCall(
    toolName: string,
    args: Record<string, unknown>,
    creds?: MimecastCredentials,
  ): Promise<CallToolResult>;
}

export function isDomainName(value: string): value is DomainName {
  return ['messages', 'threats', 'queue'].includes(value);
}
