# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
