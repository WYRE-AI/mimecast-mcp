# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Interactive message card via MCP Apps (SEP-1865).** `mimecast_get_message_info` results now render as an interactive card in MCP Apps hosts (Claude Desktop/web, and other hosts advertising the `io.modelcontextprotocol/ui` extension), instead of a wall of JSON. The card shows the subject, delivery status, sender/recipients as display-name-resolved strings, key timestamps, route, sender IP, spam score, size, attachment presence, and any rejection details. The card is read-only — hold/release stay explicit model-driven tool calls. Non-App hosts are unaffected: the tool's JSON payload is unchanged apart from a new `_card` field.
  - The renderable tool advertises the UI via `_meta` (`ui/resourceUri`, plus the nested `ui.resourceUri` form) pointing at a new `ui://mimecast/message-card.html` resource served as `text/html;profile=mcp-app`. The card HTML is a self-contained vite single-file bundle embedded at build time (`src/generated/message-card-html.ts`, committed), so it serves identically from stdio, Node HTTP, and the fs-less Cloudflare Workers runtime. The server now declares the `resources` capability and answers `resources/list` / `resources/read` (`src/resources.ts`) on both the Node and Worker entry points.
  - The card is neutral by default (system fonts, no vendor identity, no external fetches) and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`): at serve time the server replaces the card's BRAND_INJECT marker with an inline, `<`-escaped `window.__BRAND__` script, so self-hosters can theme the card without rebuilding. No brand configured = HTML served unchanged.
  - The card payload builder is best-effort: an unexpected `MessageInfo` shape drops the card without affecting the tool result. New contract tests in `src/__tests__/mcp-apps.test.ts` pin the `_meta` advertisement, the `ui://` resource wire shape, the neutral-default/brand-injection behavior, and the card normalization.

### Fixed

- `GET /health` (and new `/healthz` alias) is now a shallow, unauthenticated
  liveness handler that always returns HTTP 200 `{"status":"ok"}` without
  checking credentials. Previously `/health` ran `getCredentials()` and
  returned HTTP 503 whenever credentials were absent. In gateway mode
  credentials arrive per-request via `X-Mimecast-*` headers on `/mcp`, so the
  probe endpoint had none and returned 503 on every check — causing Azure
  Container Apps to mark the revision Unhealthy and SIGTERM the container in a
  crash loop (and emitting a `Missing Mimecast credentials` warning every 30s,
  matching the probe period).
