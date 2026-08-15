FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
# GitHub Packages auth comes in as a BuildKit secret (the release workflow
# passes --secret id=npmrc) so the token never lands in a layer or in image
# metadata. Local builds: --secret id=npmrc,src=$HOME/.npmrc
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

FROM node:26-alpine AS production
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=8080 \
    AUTH_MODE=gateway \
    LOG_LEVEL=info
CMD ["node", "dist/index.js"]

LABEL org.opencontainers.image.title="mimecast-mcp"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/mimecast-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/mimecast-mcp"
