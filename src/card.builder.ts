/**
 * Message-card payload builder for the MCP Apps (SEP-1865) UI surface.
 *
 * mimecast_get_message_info results get a normalized `_card` object attached
 * (see domains/messages.ts) that the ui:// message card renders from. The card
 * is progressive enhancement: normalization is best-effort, and a null return
 * simply means the host renders no card while the JSON payload is unchanged.
 *
 * The card is read-only: message hold/release stay explicit model-driven tool
 * calls, so the card never writes back to Mimecast.
 */

export const MESSAGE_CARD_RESOURCE_URI = 'ui://mimecast/message-card.html';

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const MESSAGE_CARD_META = {
  'ui/resourceUri': MESSAGE_CARD_RESOURCE_URI,
  ui: { resourceUri: MESSAGE_CARD_RESOURCE_URI },
} as const;

/** Mirror of Brand in ui/message-card.ts — keep in sync. */
export interface CardBrand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}

/** The BRAND_INJECT comment marker baked into the card HTML (see ui/index.html). */
const BRAND_INJECT_RE = /<!--\s*BRAND_INJECT:[\s\S]*?-->/;

/**
 * Serve-time brand injection: replace the BRAND_INJECT marker with an inline
 * `window.__BRAND__` script so self-hosters can theme the card without
 * rebuilding the bundle. An empty brand returns the HTML unchanged (the card
 * renders its neutral defaults). `<` is escaped so brand values can never
 * break out of the script tag.
 */
export function applyBrandInjection(html: string, brand: CardBrand): string {
  if (!brand || Object.values(brand).every((v) => !v)) return html;
  const json = JSON.stringify(brand).replace(/</g, '\\u003c');
  return html.replace(BRAND_INJECT_RE, `<script>window.__BRAND__=${json}</script>`);
}

/**
 * Resolve brand overrides from MCP_BRAND_* environment variables. Guarded for
 * runtimes without `process` (Cloudflare Workers), where this returns an empty
 * brand and the card serves its neutral defaults.
 */
export function resolveBrandFromEnv(): CardBrand {
  if (typeof process === 'undefined' || !process.env) return {};
  const env = process.env;
  const brand: CardBrand = {};
  if (env.MCP_BRAND_NAME) brand.name = env.MCP_BRAND_NAME;
  if (env.MCP_BRAND_LOGO_URL) brand.logoUrl = env.MCP_BRAND_LOGO_URL;
  if (env.MCP_BRAND_PRIMARY_COLOR) brand.primaryColor = env.MCP_BRAND_PRIMARY_COLOR;
  if (env.MCP_BRAND_ACCENT_COLOR) brand.accentColor = env.MCP_BRAND_ACCENT_COLOR;
  if (env.MCP_BRAND_BG) brand.bg = env.MCP_BRAND_BG;
  if (env.MCP_BRAND_TEXT) brand.text = env.MCP_BRAND_TEXT;
  return brand;
}

/** Mirror of MessageCard in ui/message-card.ts — keep in sync. */
export interface MessageCard {
  id: string;
  subject: string;
  status?: string;
  from?: string;
  to: string[];
  received?: string;
  processed?: string;
  route?: string;
  senderIp?: string;
  spamScore?: number;
  size?: string;
  hasAttachments?: boolean;
  rejection?: { type?: string; code?: string; message?: string };
}

const CARD_RECIPIENT_LIMIT = 3;

interface EmailParty {
  emailAddress?: unknown;
  displayableName?: unknown;
}

/** Format a Mimecast address object as `Name <email>` (or just the email). */
function formatAddress(party: EmailParty | undefined): string | undefined {
  if (!party || typeof party.emailAddress !== 'string' || !party.emailAddress) return undefined;
  if (typeof party.displayableName === 'string' && party.displayableName) {
    return `${party.displayableName} <${party.emailAddress}>`;
  }
  return party.emailAddress;
}

/** Humanize a byte count for display (e.g. 34816 -> "34.0 KB"). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build the renderable card from a mimecast_get_message_info payload
 * (node-mimecast `MessageInfo`). Pure and defensive: every field is
 * type-checked, and any unexpected shape returns null rather than throwing.
 */
export function buildMessageCard(info: unknown): MessageCard | null {
  try {
    const msg = info as Record<string, unknown>;
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string' || !msg.id) {
      return null;
    }

    const card: MessageCard = {
      id: msg.id,
      subject:
        typeof msg.subject === 'string' && msg.subject ? msg.subject : '(no subject)',
      to: [],
    };

    if (typeof msg.status === 'string' && msg.status) card.status = msg.status;

    const from = formatAddress(msg.fromEnv as EmailParty | undefined);
    if (from) card.from = from;

    if (Array.isArray(msg.to)) {
      const recipients = msg.to
        .map((r) => formatAddress(r as EmailParty))
        .filter((r): r is string => !!r);
      card.to = recipients.slice(0, CARD_RECIPIENT_LIMIT);
      if (recipients.length > CARD_RECIPIENT_LIMIT) {
        card.to.push(`+${recipients.length - CARD_RECIPIENT_LIMIT} more`);
      }
    }

    if (typeof msg.received === 'string' && msg.received) card.received = msg.received;
    if (typeof msg.processed === 'string' && msg.processed) card.processed = msg.processed;
    if (typeof msg.route === 'string' && msg.route) card.route = msg.route;
    if (typeof msg.senderIp === 'string' && msg.senderIp) card.senderIp = msg.senderIp;
    if (typeof msg.spamScore === 'number') card.spamScore = msg.spamScore;
    if (typeof msg.size === 'number') card.size = formatSize(msg.size);
    if (typeof msg.attachments === 'boolean') card.hasAttachments = msg.attachments;

    const rejection = msg.rejectionInfo as Record<string, unknown> | undefined;
    if (rejection && typeof rejection === 'object') {
      const rej: NonNullable<MessageCard['rejection']> = {};
      if (typeof rejection.rejectionType === 'string' && rejection.rejectionType) {
        rej.type = rejection.rejectionType;
      }
      if (typeof rejection.rejectionCode === 'string' && rejection.rejectionCode) {
        rej.code = rejection.rejectionCode;
      }
      if (typeof rejection.rejectionMessage === 'string' && rejection.rejectionMessage) {
        rej.message = rejection.rejectionMessage;
      }
      if (Object.keys(rej).length > 0) card.rejection = rej;
    }

    return card;
  } catch {
    // Best-effort: an unexpected payload never breaks the tool result.
    return null;
  }
}
