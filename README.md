# Otharion

Dual-Platform Middleman and Next-Generation Bot Engine across Discord and Fluxer platforms.

## Overview

Otharion acts as a standalone bot engine and state middleman. It connects directly to the shared JSON v2.1.0 data stores (`afk.json` and `sync.json`), allowing seamless cross-platform AFK state management, account verification, and community utilities across Discord and Fluxer without duplicating storage or creating memory desync.

## Core Features

- **Shared Middleman Storage**: Direct atomic synchronization with partitioned JSON v2.1.0 data architecture (`global`, `platform`, `server`).
- **Dual-Gateway Support**: Built on `discord.js v14` and `@fluxerjs/core v3`.
- **AFK Engine**:
  - Global, platform-specific, and server-specific scopes.
  - Automatic cross-platform synchronization for linked accounts.
  - Anti-spam mention throttling (10-second suppression window).
- **Account Synchronization**:
  - One-time 30-second token verification (`o.sync`).
  - Bidirectional O(1) in-memory account lookups.
- **Minimalist Obsidian Architecture**: Pure black embeds (`0x000001`), zero-clutter formatting.
- **Resource Optimized**: Runs cleanly under 128MB RAM with minimal caching (`Options.cacheWithLimits`).

## Commands

- `o.help [command]` — Display commands index and detailed parameter specifications.
- `o.ping` — Check gateway WebSocket latency.
- `o.status` — Display Otharion middleman system status and shared data connectivity.
- `o.afk [global|server|platform] [reason]` — Set AFK status.
- `o.sync [code]` — Generate or verify cross-platform account linking codes.

## Development

```bash
# Install dependencies
pnpm install

# Typecheck and lint
pnpm lint

# Build TypeScript to dist
pnpm build

# Run unit test suite
pnpm test

# Run in development mode
pnpm dev
```
