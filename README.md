# Mimecast MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for Mimecast email security. Enables AI assistants to track messages, investigate threats, manage email queues, and access threat intelligence data.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Mimecast environment.

> **Part of the [MSP Claude Plugins](https://github.com/wyre-technology) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Installation

```bash
npm install @wyre-technology/mimecast-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MIMECAST_CLIENT_ID` | Yes | Your Mimecast API client ID |
| `MIMECAST_CLIENT_SECRET` | Yes | Your Mimecast API client secret |
| `MIMECAST_REGION` | Yes | Your Mimecast region: us, eu, de, au, za, ca |
| `MCP_TRANSPORT` | No | Transport mode: stdio (default) or http |

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mimecast-mcp": {
      "command": "npx",
      "args": ["@wyre-technology/mimecast-mcp"],
      "env": {
        "MIMECAST_CLIENT_ID": "your-mimecast-client-id"
        "MIMECAST_CLIENT_SECRET": "your-mimecast-client-secret"
        "MIMECAST_REGION": "your-mimecast-region"
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
  -- npx -y @wyre-technology/mimecast-mcp
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
git clone https://github.com/wyre-technology/mimecast-mcp.git
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
