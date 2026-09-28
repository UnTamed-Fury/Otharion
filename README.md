# Otharion

Dual-Platform Middleman, Community Utility & Next-Generation Bot Engine across Discord and Fluxer.

## Overview

Otharion operates both as an independent standalone community bot and as a multi-gateway state middleman. It connects directly to shared JSON v2.1.0 data stores (`afk.json` and `sync.json`), powers an ultra-configurable security matrix, hosts interactive community features (counting, debounced sticky messages), and relays cross-platform communication between Discord and Fluxer with anti-echo safeguards.

## Features

### 1. Ultra-Configurable Honeypot Trap Matrix
- **Multi-Channel Trapping**: Arm arbitrary channels as honeypot traps for malicious bots and raiders.
- **Deep Action Matrix**: Configurable enforcement: `ban`, `kick`, `timeout` (custom duration), or `quarantine`.
- **Message History Purge**: Automatically wipes 0–7 days of offender message history.
- **Security Audit Alerts**: Dispatches rich embed telemetry to a designated moderator alert channel.
- **Join-Window Filtering**: Target accounts that post within $N$ seconds of joining.
- **Immunity System**: Automatic protection for Server Administrators, Bot Developers/Owners, and custom immune roles.

### 2. Sequential Counting Channel with Hardcore Mode
- **Consecutive Sequence Integrity**: Tracks numbers sequentially starting from `1`.
- **Anti-Double Count**: Strict rule preventing any member from counting twice consecutively.
- **Dynamic Feedback**: Real-time message reactions (`✅` on success, `❌` on ruin).
- **Server Record Tracking**: Automatically tracks and broadcasts all-time server high scores.
- **Hardcore Penalty**: Configurable timeout (e.g. 5 minutes) automatically applied to any member who ruins the count.

### 3. Debounced Sticky Messages
- **Bottom Pinned Messages**: Automatically keeps vital announcements pinned to the bottom of busy channels.
- **Rate-Limit Safe Debouncing**: Deletes the old sticky and re-posts only after 5 messages or a 10-second cooldown window.

### 4. Cross-Platform Bridge (Discord <-> Fluxer)
- **Bidirectional Relay**: Seamlessly forwards messages, nicknames, and attachments across designated platform channels.
- **Anti-Echo Signature Cache**: In-memory TTL signature hashing prevents infinite ping-pong relay loops.

### 5. Shared Middleman State (Mark x Otharion)
- **Shared AFK Engine**: Supports `global`, `platform`, and `server` scopes with atomic JSON v2.1.0 persistence and 10s mention suppression.
- **Cross-Platform Account Sync**: 30-second one-time tokens with $O(1)$ bidirectional memory mapping.
- **Mark AnimeX Proxy Plugin**: Optional plugin module allowing Otharion to act as the primary engine while proxying AnimeX commands in the AnimeX Discord server.

### 6. Self-Hostable Configuration (`.config.otharion`)
- Zero external database required by default.
- Full YAML/JSON server matrix configured locally and reactive to in-chat Discord management commands.

---

## Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `o.help` | `o.help [command]` | Display command index and detailed parameter specifications |
| `o.ping` | `o.ping` | Check gateway WebSocket latency |
| `o.status` | `o.status` | View system status, heap memory, and shared data connectivity |
| `o.afk` | `o.afk [global\|server\|platform] [reason]` | Set multi-scope AFK status |
| `o.sync` | `o.sync [code]` | Generate 30s token or pair Discord and Fluxer accounts |
| `o.counting` | `o.counting [setup #chan \| hardcore <min\|off> \| reset \| status]` | Manage sequential counting channel and penalties |
| `o.honeypot` | `o.honeypot [add #chan \| remove #chan \| action <act> \| log #chan \| status]` | Configure anti-raid honeypot trap security matrix |
| `o.sticky` | `o.sticky [set #chan <msg> \| remove #chan \| list]` | Manage debounced channel sticky announcements |
| `o.bridge` | `o.bridge [pair <dcChan> <fxChan> \| remove <chan> \| list]` | Manage bidirectional cross-platform channel relays |
| `o.config` | `o.config` | View global runtime mode and in-chat server settings |

---

## Build & Execution Modes

```bash
# Build sole runner (pure Otharion engine)
pnpm build:sole

# Build with Mark AnimeX proxy plugin mounted
pnpm build:mark

# Run sole runner
pnpm start:sole

# Run in Mark proxy mode
pnpm start:mark

# Run unit tests
pnpm test
```
