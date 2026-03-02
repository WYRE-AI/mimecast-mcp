/**
 * Cloudflare Worker entry point for Mimecast MCP server
 * Stateless — one transport per request
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDomainHandler, getAvailableDomains } from './domains/index.js';
import { isDomainName, type DomainName } from './utils/types.js';
import { getCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';

interface Env {
  MIMECAST_CLIENT_ID?: string;
  MIMECAST_CLIENT_SECRET?: string;
  MIMECAST_REGION?: string;
}

function createMcpServer(): Server {
  const server = new Server(
    { name: 'mimecast-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  let currentDomain: DomainName | null = null;

  const navigateTool: Tool = {
    name: 'mimecast_navigate',
    description: 'Navigate to a Mimecast domain: messages, threats, or queue.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: getAvailableDomains() },
      },
      required: ['domain'],
    },
  };

  const backTool: Tool = {
    name: 'mimecast_back',
    description: 'Return to the main navigation menu.',
    inputSchema: { type: 'object', properties: {} },
  };

  const statusTool: Tool = {
    name: 'mimecast_status',
    description: 'Show current navigation state and credential status.',
    inputSchema: { type: 'object', properties: {} },
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [statusTool];
    if (currentDomain === null) {
      tools.unshift(navigateTool);
    } else {
      tools.unshift(backTool);
      const handler = await getDomainHandler(currentDomain);
      tools.push(...handler.getTools());
    }
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'mimecast_navigate') {
        const domain = (args as { domain: string }).domain;
        if (!isDomainName(domain)) {
          return { content: [{ type: 'text', text: `Invalid domain: ${domain}` }], isError: true };
        }
        currentDomain = domain;
        const handler = await getDomainHandler(domain);
        const tools = handler.getTools().map(t => `- ${t.name}`).join('\n');
        return { content: [{ type: 'text', text: `Navigated to ${domain}.\n\n${tools}` }] };
      }

      if (name === 'mimecast_back') {
        currentDomain = null;
        return { content: [{ type: 'text', text: 'Returned to main menu.' }] };
      }

      if (name === 'mimecast_status') {
        const creds = getCredentials();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentDomain,
              credentials: { configured: !!creds, region: creds?.region },
            }, null, 2),
          }],
        };
      }

      if (currentDomain !== null) {
        const handler = await getDomainHandler(currentDomain);
        if (handler.getTools().some(t => t.name === name)) {
          return await handler.handleCall(name, (args as Record<string, unknown>) ?? {});
        }
      }

      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Tool call failed', { tool: name, error: message });
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        transport: 'cloudflare-worker',
        timestamp: new Date().toISOString(),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname !== '/mcp') {
      return new Response(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Inject env binding credentials
    if (env.MIMECAST_CLIENT_ID) process.env.MIMECAST_CLIENT_ID = env.MIMECAST_CLIENT_ID;
    if (env.MIMECAST_CLIENT_SECRET) process.env.MIMECAST_CLIENT_SECRET = env.MIMECAST_CLIENT_SECRET;
    if (env.MIMECAST_REGION) process.env.MIMECAST_REGION = env.MIMECAST_REGION;

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    const server = createMcpServer();
    await server.connect(transport);
    return transport.handleRequest(request);
  },
} satisfies ExportedHandler<Env>;
