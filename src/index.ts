#!/usr/bin/env node
/**
 * Mimecast MCP Server
 *
 * This MCP server provides tools for interacting with the Mimecast API.
 * All tools are listed upfront so they work with every MCP client, including
 * remote connectors (claude.ai, mcp-remote) that do not support dynamic
 * tool-list changes. A helper `mimecast_navigate` tool provides domain
 * discovery and guidance.
 *
 * Transports:
 *   - stdio (default): Claude Desktop / CLI
 *   - http: Hosted deployment with gateway auth
 *
 * Credential sources:
 *   env vars: MIMECAST_CLIENT_ID, MIMECAST_CLIENT_SECRET, MIMECAST_REGION
 *   gateway headers (AUTH_MODE=gateway):
 *     X-Mimecast-Client-ID, X-Mimecast-Client-Secret, X-Mimecast-Region
 *
 * Security: process.env is NEVER mutated per-request. In gateway mode
 * credentials extracted from headers are passed as an explicit argument
 * through createMcpServer() → handler.handleCall() → getClient(), so
 * concurrent requests cannot contaminate each other's credentials.
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDomainHandler, getAvailableDomains } from './domains/index.js';
import { isDomainName, type DomainName } from './utils/types.js';
import { buildCredentials, getCredentials, type MimecastCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';

// ─── Domain Configuration ───────────────────────────────────────────────────

/**
 * Domain metadata for navigation
 */
const domainDescriptions: Record<DomainName, string> = {
  messages: "Message tracking and management - find, hold, release email messages",
  threats: "Threat detection and incident management - TTP logs, threat indicators, and security events",
  queue: "Message queue monitoring - delivery queue status and email flow analysis",
};

/**
 * Map from domain name to its tool definitions (loaded lazily)
 */
const domainToolMap = new Map<DomainName, Tool[]>();

/**
 * All domain tools, collected once at startup
 */
let allDomainTools: Tool[] | null = null;

/**
 * Load all domain tools (lazy-loaded on first access)
 */
async function getAllDomainTools(): Promise<Tool[]> {
  if (allDomainTools !== null) {
    return allDomainTools;
  }

  const domains = getAvailableDomains();
  const tools: Tool[] = [];

  for (const domain of domains) {
    if (!domainToolMap.has(domain)) {
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();
      domainToolMap.set(domain, domainTools);
    }
    tools.push(...domainToolMap.get(domain)!);
  }

  allDomainTools = tools;
  return tools;
}

// ─── MCP Server Factory ──────────────────────────────────────────────────────

/**
 * Create an MCP server instance bound to the supplied credentials.
 *
 * @param creds - Per-request credentials (gateway mode). Omit for stdio / env
 *                mode where process.env carries the credentials.
 *
 * SECURITY: credentials are threaded explicitly through every tool call.
 * process.env is never mutated by this function or anything it calls.
 */
function createMcpServer(creds?: MimecastCredentials): Server {
  const server = new Server(
    { name: 'mimecast-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  /**
   * Navigation / discovery tool - helps the LLM find the right tools
   *
   * This is a stateless helper that describes available tools for a domain.
   * All domain tools are always listed in tools/list regardless of navigation
   * state, because many MCP clients (claude.ai connectors, mcp-remote) only
   * fetch the tool list once and do not support notifications/tools/list_changed.
   */
  const navigateTool: Tool = {
    name: 'mimecast_navigate',
    description:
      'Discover available Mimecast tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: getAvailableDomains(),
          description: `The domain to explore:
- messages: ${domainDescriptions.messages}
- threats: ${domainDescriptions.threats}
- queue: ${domainDescriptions.queue}`,
        },
      },
      required: ['domain'],
    },
  };

  /**
   * Status tool - shows credentials status and available domains
   */
  const statusTool: Tool = {
    name: 'mimecast_status',
    description: 'Show credentials status and available domains. All tools are always available.',
    inputSchema: { type: 'object', properties: {} },
  };

  /**
   * Handle ListTools requests - always returns ALL tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const domainTools = await getAllDomainTools();
    return { tools: [navigateTool, statusTool, ...domainTools] };
  });

  /**
   * Handle CallTool requests
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info('Tool call received', { tool: name });

    try {
      // Handle navigation / discovery helper
      if (name === 'mimecast_navigate') {
        const { domain } = args as { domain: DomainName };

        if (!isDomainName(domain)) {
          return {
            content: [{
              type: 'text',
              text: `Invalid domain: ${domain}. Available domains: ${getAvailableDomains().join(', ')}`,
            }],
            isError: true,
          };
        }

        const handler = await getDomainHandler(domain);
        const tools = handler.getTools();

        const toolSummary = tools
          .map((t) => `- ${t.name}: ${t.description}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: [
              `## ${domain.charAt(0).toUpperCase() + domain.slice(1)} Domain`,
              '',
              domainDescriptions[domain],
              '',
              '**Available tools:**',
              toolSummary,
              '',
              '*All tools are callable at any time — no navigation required.*',
            ].join('\n'),
          }],
        };
      }

      // Handle status
      if (name === 'mimecast_status') {
        // Use request-scoped creds if available; fall back to env (stdio mode)
        const resolvedCreds = creds ?? getCredentials();
        const allTools = await getAllDomainTools();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              server: 'mimecast-mcp',
              version: '1.0.0',
              status: 'All tools available',
              availableDomains: getAvailableDomains(),
              totalTools: allTools.length,
              credentials: {
                configured: !!resolvedCreds,
                region: resolvedCreds?.region ?? null,
                baseUrl: resolvedCreds?.baseUrl ?? null,
              },
            }, null, 2),
          }],
        };
      }

      // Domain tool dispatch - check all domain handlers
      const allTools = await getAllDomainTools();
      const tool = allTools.find(t => t.name === name);

      if (tool) {
        // Find which domain this tool belongs to
        for (const domain of getAvailableDomains()) {
          const handler = await getDomainHandler(domain);
          const domainTools = handler.getTools();

          if (domainTools.some(t => t.name === name)) {
            // Pass per-request creds; handler passes them to getClient()
            const result = await handler.handleCall(name, (args as Record<string, unknown>) ?? {}, creds);
            logger.debug('Tool call completed', { tool: name, domain });
            return result;
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Unknown tool: ${name}. Use mimecast_navigate to explore available tools by domain.`,
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
  // stdio mode: no per-request creds; getClient() reads process.env
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

    // Health check — shallow, unauthenticated liveness probe.
    // Must NOT check credentials: in gateway mode credentials arrive
    // per-request via headers on /mcp, so a credential-aware /health
    // returns 503 on every probe and Azure SIGTERMs the container.
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        transport: 'http',
        authMode: isGatewayMode ? 'gateway' : 'env',
        version: '1.0.0',
      }));
      return;
    }

    if (url.pathname === '/mcp') {
      // Resolve per-request credentials without touching process.env
      let requestCreds: MimecastCredentials | undefined;

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

        requestCreds = buildCredentials(clientId, clientSecret, region) ?? undefined;
      }

      // Create fresh server + transport per request (stateless).
      // Per-request creds are captured in the closure; no global state written.
      const server = createMcpServer(requestCreds);
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
    res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health', '/healthz'] }));
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
