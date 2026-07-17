/**
 * Iframe bridge + renderer for the Mimecast message card (MCP Apps, SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the tool result from the host. The card is read-only:
 * message hold/release stay explicit model-driven tool calls, so the card
 * never writes back to Mimecast.
 *
 * The server attaches a normalized `_card` payload to mimecast_get_message_info
 * results (see src/card.builder.ts) so this renderer never needs to resolve
 * ids or format vendor fields itself.
 *
 * Rendering uses DOM construction (no innerHTML) — subjects, addresses, and
 * rejection text are untrusted email data, so text only ever lands in text
 * nodes.
 *
 * White-label: the card is neutral by default (no vendor identity) and applies
 * an injected `window.__BRAND__` override (set by the MCP server via
 * MCP_BRAND_* env vars, or a gateway per-org) so the same card can render in
 * any operator's brand.
 */
import { App } from '@modelcontextprotocol/ext-apps';

interface Brand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}
declare global {
  interface Window {
    __BRAND__?: Brand;
  }
}

/** Mirror of MessageCard in src/card.builder.ts — keep in sync. */
interface MessageCard {
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

const brand: Brand = window.__BRAND__ ?? {};
const brandName = brand.name ?? '';

// Apply any injected brand overrides onto the CSS custom properties.
function applyBrand(): void {
  const root = document.documentElement.style;
  if (brand.primaryColor) root.setProperty('--brand-primary', brand.primaryColor);
  if (brand.accentColor) root.setProperty('--brand-accent', brand.accentColor);
  if (brand.bg) root.setProperty('--brand-bg', brand.bg);
  if (brand.text) root.setProperty('--brand-text', brand.text);
}

const app = new App({ name: 'Mimecast Message Card', version: '1.0.0' });

/** Create an element with a class and (safe, text-node) children. */
function el(
  tag: string,
  className = '',
  ...children: Array<Node | string | null>
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function field(label: string, value: string | undefined, wide = false): HTMLElement | null {
  if (!value) return null;
  return el(
    'div',
    wide ? 'field field--wide' : 'field',
    el('div', 'field__label', label),
    el('div', 'field__value', value),
  );
}

function listField(label: string, values: string[]): HTMLElement | null {
  if (values.length === 0) return null;
  const value = el('div', 'field__value');
  for (const v of values) value.append(el('div', '', v));
  return el('div', 'field field--wide', el('div', 'field__label', label), value);
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el('span', `badge ${cls}`, text) : null;
}

function render(m: MessageCard): void {
  // Brand identity only renders when a brand was injected — the neutral
  // default shows just the vendor/message context in the header.
  let brandId: HTMLElement | null = null;
  if (brandName || brand.logoUrl) {
    brandId = el('span', 'brandid');
    if (brand.logoUrl) {
      const logo = document.createElement('img');
      logo.src = brand.logoUrl;
      logo.alt = brandName;
      logo.style.display = 'inline-block';
      brandId.append(logo);
    }
    if (brandName) brandId.append(el('span', 'brand', brandName));
  }

  const msgId = el('span', 'msgid', 'Mimecast · Message');
  msgId.title = m.id;

  const spamBadge =
    typeof m.spamScore === 'number' ? badge(`Spam ${m.spamScore}`, 'badge--spam') : null;

  let rejection: HTMLElement | null = null;
  if (m.rejection && (m.rejection.type || m.rejection.code || m.rejection.message)) {
    const detail = el('div', 'rejection__detail');
    const headline = [m.rejection.type, m.rejection.code].filter(Boolean).join(' · ');
    if (headline) detail.append(el('span', 'rejection__type', `${headline}: `));
    if (m.rejection.message) detail.append(m.rejection.message);
    rejection = el('div', 'rejection', el('div', 'rejection__h', 'Rejection'), detail);
  }

  const body = el(
    'div',
    'card__body',
    el('div', 'brandrow', brandId, msgId),
    el('h1', '', m.subject),
    el(
      'div',
      'badges',
      badge(m.status, 'badge--status'),
      spamBadge,
      m.hasAttachments ? badge('Attachments', '') : null,
    ),
    el(
      'div',
      'grid',
      field('From', m.from, true),
      listField('To', m.to),
      field('Received', m.received && fmtDate(m.received)),
      field('Processed', m.processed && fmtDate(m.processed)),
      field('Route', m.route),
      field('Sender IP', m.senderIp),
      field('Size', m.size),
    ),
    rejection,
  );

  const root = document.getElementById('root')!;
  root.replaceChildren(el('div', 'card', el('div', 'card__bar'), body));
}

// mimecast-mcp returns the message JSON directly and attaches the normalized
// card to mimecast_get_message_info results as _card.
function extractCard(obj: unknown): MessageCard | null {
  const card = (obj as { _card?: MessageCard })?._card;
  return card && typeof card.id === 'string' && typeof card.subject === 'string' ? card : null;
}

applyBrand();

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
  const payload = (result.content ?? []).find((c) => c.type === 'text');
  if (!payload?.text) return;
  try {
    const card = extractCard(JSON.parse(payload.text));
    if (card) render(card);
  } catch {
    /* ignore malformed payloads */
  }
};

app.connect();
