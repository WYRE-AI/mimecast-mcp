#!/usr/bin/env node
/**
 * Mimecast MCP Server with Decision Tree Architecture
 *
 * Hierarchical tool loading:
 *   1. Exposes navigation tools only at start
 *   2. After domain selection, exposes domain-specific tools
 *   3. Lazy-loads domain handlers and the Mimecast client
 *
 * Transports:
 *   - stdio (default): Claude Desktop / CLI
 *   - http: Hosted deployment with gateway auth
 *
 * Credential sources:
 *   env vars: MIMECAST_CLIENT_ID, MIMECAST_CLIENT_SECRET, MIMECAST_REGION
 *   gateway headers (AUTH_MODE=gateway):
 *     X-Mimecast-Client-ID, X-Mimecast-Client-Secret, X-Mimecast-Region
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDomainHandler, getAvailableDomains } from './domains/index.js';
import { isDomainName, type DomainName } from './utils/types.js';
import { getCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';

// ─── MCP Server Factory ──────────────────────────────────────────────────────

function createMcpServer(): Server {
  // Navigation state scoped to this server instance
  let currentDomain: DomainName | null = null;

  const server = new Server(
    { name: 'mimecast-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const navigateTool: Tool = {
    name: 'mimecast_navigate',
    description:
      'Navigate to a Mimecast domain to access its tools. ' +
      'Domains: messages (tracking, hold/release), threats (TTP logs, incidents, audit), queue (delivery queue status).',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: getAvailableDomains(),
          description: 'Domain to navigate to: messages, threats, or queue',
        },
      },
      required: ['domain'],
    },
  };

  const backTool: Tool = {
    name: 'mimecast_back',
    description: 'Return to the main domain navigation menu.',
    inputSchema: { type: 'object', properties: {} },
  };

  const statusTool: Tool = {
    name: 'mimecast_status',
    description:
      'Show current navigation state, credential status, and available domains.',
    inputSchema: { type: 'object', properties: {} },
  };

  async function getToolsForState(): Promise<Tool[]> {
    const tools: Tool[] = [statusTool];

    if (currentDomain === null) {
      tools.unshift(navigateTool);
    } else {
      tools.unshift(backTool);
      const handler = await getDomainHandler(currentDomain);
      tools.push(...handler.getTools());
    }

    return tools;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: await getToolsForState() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info('Tool call received', { tool: name });

    try {
      // Navigation
      if (name === 'mimecast_navigate') {
        const domain = (args as { domain: string }).domain;

        if (!isDomainName(domain)) {
          return {
            content: [{
              type: 'text',
              text: `Invalid domain: ${domain}. Available: ${getAvailableDomains().join(', ')}`,
            }],
            isError: true,
          };
        }

        const creds = getCredentials();
        if (!creds) {
          return {
            content: [{
              type: 'text',
              text: 'Error: No Mimecast credentials configured. ' +
                'Set MIMECAST_CLIENT_ID, MIMECAST_CLIENT_SECRET, and optionally MIMECAST_REGION.',
            }],
            isError: true,
          };
        }

        currentDomain = domain;
        const handler = await getDomainHandler(domain);
        const domainTools = handler.getTools();
        logger.info('Navigated to domain', { domain, toolCount: domainTools.length });

        return {
          content: [{
            type: 'text',
            text: [
              `Navigated to the ${domain} domain.`,
              '',
              'Available tools:',
              ...domainTools.map(t => `- ${t.name}: ${t.description}`),
              '',
              'Use mimecast_back to return to the main menu.',
            ].join('\n'),
          }],
        };
      }

      // Back
      if (name === 'mimecast_back') {
        const prev = currentDomain;
        currentDomain = null;
        return {
          content: [{
            type: 'text',
            text: `Returned from ${prev ?? 'root'} to the main menu.\n\nAvailable domains: ${getAvailableDomains().join(', ')}`,
          }],
        };
      }

      // Status
      if (name === 'mimecast_status') {
        const creds = getCredentials();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              server: 'mimecast-mcp',
              version: '1.0.0',
              currentDomain: currentDomain ?? '(none — at main menu)',
              availableDomains: getAvailableDomains(),
              credentials: {
                configured: !!creds,
                region: creds?.region ?? null,
                baseUrl: creds?.baseUrl ?? null,
              },
            }, null, 2),
          }],
        };
      }

      // Domain tool dispatch
      if (currentDomain !== null) {
        const handler = await getDomainHandler(currentDomain);
        const domainTools = handler.getTools();

        if (domainTools.some(t => t.name === name)) {
          const result = await handler.handleCall(name, (args as Record<string, unknown>) ?? {});
          logger.debug('Tool call completed', { tool: name });
          return result;
        }
      }

      return {
        content: [{
          type: 'text',
          text: currentDomain
            ? `Unknown tool: ${name}. You are in the ${currentDomain} domain. Use mimecast_back to go to the main menu.`
            : `Unknown tool: ${name}. Use mimecast_navigate to select a domain first.`,
        }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Tool call failed', { tool: name, error: message });
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ─── stdio Transport ────────────────────────────────────────────────────────────

async function startStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Mimecast MCP server running on stdio (decision tree mode)');
}

// ─── HTTP Streaming Transport ───────────────────────────────────────────────────

async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = process.env.MCP_HTTP_HOST || '0.0.0.0';
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check — unauthenticated
    if (url.pathname === '/health') {
      const creds = getCredentials();
      const statusCode = creds ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: creds ? 'ok' : 'degraded',
        transport: 'http',
        authMode: isGatewayMode ? 'gateway' : 'env',
        timestamp: new Date().toISOString(),
        credentials: {
          configured: !!creds,
          region: creds?.region ?? null,
        },
        version: '1.0.0',
      }));
      return;
    }

    if (url.pathname === '/mcp') {
      // Gateway mode: extract credentials from injected headers
      if (isGatewayMode) {
        const clientId = req.headers['x-mimecast-client-id'] as string | undefined;
        const clientSecret = req.headers['x-mimecast-client-secret'] as string | undefined;
        const region = req.headers['x-mimecast-region'] as string | undefined;

        if (!clientId || !clientSecret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Missing credentials',
            message: 'Gateway mode requires X-Mimecast-Client-ID and X-Mimecast-Client-Secret headers',
            required: ['X-Mimecast-Client-ID', 'X-Mimecast-Client-Secret'],
            optional: ['X-Mimecast-Region'],
          }));
          return;
        }

        process.env.MIMECAST_CLIENT_ID = clientId;
        process.env.MIMECAST_CLIENT_SECRET = clientSecret;
        if (region) process.env.MIMECAST_REGION = region;
      }

      // Create fresh server + transport per request (stateless)
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on('close', () => {
        transport.close();
        server.close();
      });

      server.connect(transport).then(() => {
        transport.handleRequest(req, res);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(`Mimecast MCP server listening on http://${host}:${port}/mcp`);
      logger.info(`Health check: http://${host}:${port}/health`);
      logger.info(`Auth mode: ${isGatewayMode ? 'gateway (header-based)' : 'env (environment variables)'}`);
      resolve();
    });
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await new Promise<void>((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ─── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const transportType = process.env.MCP_TRANSPORT || 'stdio';
  logger.info('Starting Mimecast MCP server', {
    transport: transportType,
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeVersion: process.version,
  });

  if (transportType === 'http') {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error('Fatal startup error', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
