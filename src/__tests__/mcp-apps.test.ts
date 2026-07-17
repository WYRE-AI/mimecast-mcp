/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the message card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildMessageCard normalizes a Mimecast MessageInfo into the card
 *      payload the iframe renders from, best-effort (a bad payload never
 *      breaks the tool result)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAvailableDomains, getDomainHandler } from '../domains/index.js';
import { listResources, readResource } from '../resources.js';
import {
  buildMessageCard,
  applyBrandInjection,
  MESSAGE_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from '../card.builder.js';
import { MESSAGE_CARD_HTML } from '../generated/message-card-html.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Read-only card: only the single-entity read tool is renderable. Hold and
// release stay explicit model-driven tool calls with no in-card round-trip.
const RENDERABLE_TOOLS = ['mimecast_get_message_info'];

async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const domain of getAvailableDomains()) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

describe('MCP Apps message card', () => {
  describe('tool _meta advertisement', () => {
    it.each(RENDERABLE_TOOLS)('%s links the card via _meta', async (name) => {
      const tool = (await getAllTools()).find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.['ui/resourceUri']).toBe(MESSAGE_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        MESSAGE_CARD_RESOURCE_URI
      );
    });

    it('no other tools carry UI metadata', async () => {
      const others = (await getAllTools()).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe('ui:// resource', () => {
    it('is listed with the MCP Apps MIME type', () => {
      const card = listResources().find((r) => r.uri === MESSAGE_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it('reads back as profile=mcp-app HTML containing the card app', () => {
      const content = readResource(MESSAGE_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(MESSAGE_CARD_HTML);
      expect(content.text).toContain('card__bar');
      expect(content.text).toContain('BRAND_INJECT');
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./message-card.ts"');
    });

    it('serves neutral defaults with no vendor identity', () => {
      const { text } = readResource(MESSAGE_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain('00c9db'); // WYRE cyan
      expect(text).not.toContain('ede947'); // WYRE yellow
      expect(text).not.toContain('fonts.googleapis.com'); // no external fetches
    });

    it('injects MCP_BRAND_* env vars into the served HTML', () => {
      vi.stubEnv('MCP_BRAND_NAME', 'Acme MSP');
      vi.stubEnv('MCP_BRAND_PRIMARY_COLOR', '#ff0000');
      try {
        const { text } = readResource(MESSAGE_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain('BRAND_INJECT');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('rejects unknown resource URIs', () => {
      expect(() => readResource('ui://mimecast/nope.html')).toThrow(/Unknown resource/);
    });
  });

  describe('applyBrandInjection', () => {
    const html = MESSAGE_CARD_HTML;

    it('replaces the marker with an inline window.__BRAND__ script', () => {
      const out = applyBrandInjection(html, { name: 'Acme', primaryColor: '#123456' });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain('BRAND_INJECT');
    });

    it('escapes < so brand values cannot break out of the script tag', () => {
      const out = applyBrandInjection(html, { name: '</script><script>alert(1)' });
      expect(out).not.toContain('</script><script>alert(1)');
      expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)');
    });

    it('returns the HTML unchanged for an empty brand', () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: '' })).toBe(html);
    });
  });

  describe('buildMessageCard', () => {
    const info = {
      id: 'eNoVzUsOgjAUAMC7vDUmFEqBrjRqQvxs',
      status: 'held',
      fromEnv: { emailAddress: 'sender@evil.example', displayableName: 'Wire Transfer Dept' },
      to: [
        { emailAddress: 'cfo@acme.example', displayableName: 'Pat CFO' },
        { emailAddress: 'ap@acme.example' },
      ],
      subject: 'Urgent: updated banking details',
      received: '2026-07-17T09:00:00Z',
      processed: '2026-07-17T09:00:05Z',
      size: 34816,
      attachments: true,
      route: 'inbound',
      senderIp: '203.0.113.9',
      spamScore: 4.2,
      headers: { 'X-Mailer': 'nope' },
      rejectionInfo: {
        rejectionType: 'Impersonation Protection',
        rejectionCode: '550',
        rejectionMessage: 'Sender failed impersonation checks',
      },
    };

    it('normalizes a MessageInfo into flat, label-resolved card fields', () => {
      const card = buildMessageCard(info);
      expect(card).toEqual({
        id: 'eNoVzUsOgjAUAMC7vDUmFEqBrjRqQvxs',
        subject: 'Urgent: updated banking details',
        status: 'held',
        from: 'Wire Transfer Dept <sender@evil.example>',
        to: ['Pat CFO <cfo@acme.example>', 'ap@acme.example'],
        received: '2026-07-17T09:00:00Z',
        processed: '2026-07-17T09:00:05Z',
        route: 'inbound',
        senderIp: '203.0.113.9',
        spamScore: 4.2,
        size: '34.0 KB',
        hasAttachments: true,
        rejection: {
          type: 'Impersonation Protection',
          code: '550',
          message: 'Sender failed impersonation checks',
        },
      });
    });

    it('falls back to "(no subject)" and omits absent fields', () => {
      const card = buildMessageCard({ id: 'abc123', status: 'delivered' });
      expect(card).toEqual({
        id: 'abc123',
        subject: '(no subject)',
        status: 'delivered',
        to: [],
      });
    });

    it('caps the recipient list and summarizes the overflow', () => {
      const card = buildMessageCard({
        id: 'abc123',
        to: [1, 2, 3, 4, 5].map((n) => ({ emailAddress: `user${n}@acme.example` })),
      });
      expect(card?.to).toEqual([
        'user1@acme.example',
        'user2@acme.example',
        'user3@acme.example',
        '+2 more',
      ]);
    });

    it('humanizes message sizes', () => {
      expect(buildMessageCard({ id: 'x', size: 512 })?.size).toBe('512 B');
      expect(buildMessageCard({ id: 'x', size: 2560 })?.size).toBe('2.5 KB');
      expect(buildMessageCard({ id: 'x', size: 3 * 1024 * 1024 })?.size).toBe('3.0 MB');
    });

    it('omits rejection when rejectionInfo carries no usable fields', () => {
      const card = buildMessageCard({ id: 'x', rejectionInfo: {} });
      expect(card?.rejection).toBeUndefined();
    });

    it('returns null for payloads that are not a message (best-effort)', () => {
      expect(buildMessageCard(null)).toBeNull();
      expect(buildMessageCard('nope')).toBeNull();
      expect(buildMessageCard({})).toBeNull();
      expect(buildMessageCard({ id: 42 })).toBeNull();
    });

    it('ignores malformed nested fields instead of throwing', () => {
      const card = buildMessageCard({
        id: 'abc123',
        fromEnv: 'not-an-object',
        to: 'not-an-array',
        rejectionInfo: { rejectionType: 42 },
      });
      expect(card).toEqual({ id: 'abc123', subject: '(no subject)', to: [] });
    });
  });

  describe('tool-result integration', () => {
    afterEach(() => {
      vi.resetModules();
      vi.doUnmock('../utils/client.js');
    });

    async function callGetMessageInfo(info: unknown): Promise<Record<string, unknown>> {
      // Reset the registry so domains/messages.js re-evaluates against the
      // mocked client module (it was already imported by earlier tests).
      vi.resetModules();
      vi.doMock('../utils/client.js', () => ({
        getClient: vi.fn(async () => ({ messages: { getInfo: vi.fn(async () => info) } })),
      }));
      const { messagesHandler } = await import('../domains/messages.js');
      const result = await messagesHandler.handleCall('mimecast_get_message_info', {
        id: 'abc123',
      });
      return JSON.parse(result.content[0].text) as Record<string, unknown>;
    }

    it('attaches _card to mimecast_get_message_info results', async () => {
      const payload = await callGetMessageInfo({ id: 'abc123', subject: 'Hello', status: 'held' });
      expect(payload).toMatchObject({ id: 'abc123', subject: 'Hello', status: 'held' });
      expect(payload._card).toMatchObject({ id: 'abc123', subject: 'Hello', status: 'held' });
    });

    it('drops the card but keeps the payload when normalization fails', async () => {
      const payload = await callGetMessageInfo({ oddly: 'shaped' });
      expect(payload).toEqual({ oddly: 'shaped' });
      expect(payload._card).toBeUndefined();
    });
  });
});
