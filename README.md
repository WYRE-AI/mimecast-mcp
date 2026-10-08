# Mimecast MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for Mimecast email security. Enables AI assistants to track messages, investigate threats, manage email queues, and access threat intelligence data.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Mimecast environment.

> **Part of the [MSP Claude Plugins](https://github.com/WYRE-AI) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Installation

```bash
npm install @wyre-ai/mimecast-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MIMECAST_CLIENT_ID` | Yes | Your Mimecast API client ID |
| `MIMECAST_CLIENT_SECRET` | Yes | Your Mimecast API client secret |
| `MIMECAST_REGION` | Yes | Tenant grid label: `us`, `eu`, `de`, `au`, `za`, `ca`, `offshore`, or `je`. API 2.0 client-credentials calls all use `https://api.services.mimecast.com`. Regional hosts such as `eu-api.mimecast.com` are API 1.0 only and do not accept this server's OAuth flow. |
| `MCP_TRANSPORT` | No | Transport mode: stdio (default) or http |

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mimecast-mcp": {
      "command": "npx",
      "args": ["@wyre-ai/mimecast-mcp"],
      "env": {
        "MIMECAST_CLIENT_ID": "your-mimecast-client-id",
        "MIMECAST_CLIENT_SECRET": "your-mimecast-client-secret",
        "MIMECAST_REGION": "us"
      }
    }
  }
}
```

### Running with Claude Code (CLI)

```bash
claude mcp add mimecast-mcp \
  -e MIMECAST_CLIENT_ID=your-value \
  -e MIMECAST_CLIENT_SECRET=your-value \
  -e MIMECAST_REGION=your-value \
  -- npx -y @wyre-ai/mimecast-mcp
```

### Docker

```bash
docker build -t mimecast-mcp .
docker run \
  -e MIMECAST_CLIENT_ID=your-value \
  -e MIMECAST_CLIENT_SECRET=your-value \
  -e MIMECAST_REGION=your-value \
  -p 8080:8080 mimecast-mcp
```

## API application permissions

Create an **API 2.0** application in the Mimecast Administration Console (Services → API and Platform Integrations) and assign it a custom administrator role. The client id and client secret from that application are `MIMECAST_CLIENT_ID` and `MIMECAST_CLIENT_SECRET`. API 1.0 applications (application id, application key, access key, and secret key with HMAC signing) are not accepted.

Grant only the permissions each tool calls. A permissions error from `mimecast_get_queue_status` or `mimecast_get_threat_incidents` means the role is missing the row below. An empty list from audit or TTP logs means the call was authorized and nothing matched the window.

| Tool | Permission on the application role |
| --- | --- |
| `mimecast_find_message`, `mimecast_get_message_info` | Gateway \| Tracking \| Read |
| `mimecast_hold_message`, `mimecast_release_message` | Account \| Monitoring \| Held \| Edit |
| `mimecast_get_queue_status` | Account \| Dashboard \| Read |
| `mimecast_get_threat_incidents` | Services \| Threat Remediation \| Read |
| `mimecast_get_ttp_logs` (`type=url`) | Monitoring \| URL Protection \| Read |
| `mimecast_get_ttp_logs` (`type=attachment`) | Monitoring \| Attachment Protection \| Read |
| `mimecast_get_ttp_logs` (`type=impersonation`) | Monitoring \| Impersonation Protection \| Read |
| `mimecast_get_audit_events` | Account \| Logs \| Read |

`mimecast_get_audit_events` also requires a start and end. When the caller omits them, the server queries the last 7 days. Mimecast only keeps 60 days of audit history, and category filters must be codes such as `account_logs` or `policy_logs` (omit `categories` to search every log). Basic Administrator includes the read permissions in Mimecast's own integration guides; Threat Remediation and Held Edit are separate and must be added explicitly.

## Available Domains

### Messages
Message tracking and investigation

### Queue
Email queue management

### Threats
Threat intelligence and detection data

## Interactive Message Card (MCP Apps)

`mimecast_get_message_info` renders as an interactive, read-only card in MCP
Apps hosts (Claude Desktop/web) showing delivery status, sender/recipients,
spam score, and rejection details; plain-JSON behavior is unchanged in other
hosts. The card is neutral by default, brandable via `window.__BRAND__`
injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`,
`MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`,
`MCP_BRAND_TEXT`) — no rebuild needed.

## Development

```bash
# Clone the repository
git clone https://github.com/WYRE-AI/mimecast-mcp.git
cd mimecast-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue to discuss changes.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
