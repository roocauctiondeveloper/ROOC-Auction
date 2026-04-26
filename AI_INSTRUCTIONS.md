# 🤖 Instructions for AI Coding Assistant

**Project:** ROOC-Auction (Discord Reservation Bot & Web Dashboard)

> [!IMPORTANT]
> **READ THIS FIRST** before making any changes to the codebase. This document contains critical context on architecture decisions and recent fixes to prevent regressions.

---

## 🏗️ Core Architecture

- **Entry Point:** `src/index.js` (Loads env, validates config, starts Web & Bot).
- **Database:** PostgreSQL (Supabase) via `pg` module.
- **Bot:** Discord.js v14.
- **Web:** Express.js + EJS + Passport (Discord Strategy).
- **Session Store:** `connect-pg-simple` (Postgres-backed).

---

## ⚡ Critical Knowledge & Recent Fixes

### 1. Database Connection Management (`src/db/database.js`)
- **Shared Pool:** The application MUST use a single shared `Pool` instance for both general queries and Web Sessions. This prevents reaching Supabase connection limits.
- **Timeout Fixes:** We recently resolved `ETIMEDOUT` errors on Render by:
    - Increasing `max` connections to 20.
    - Setting `connectionTimeoutMillis` to 15000ms.
    - Enabling `keepAlive: true`.
    - Using object-based config for `Pool` to avoid URL parsing issues with special characters in passwords (like `$`).
- **PgBouncer:** If using port 6543 (Pooler), be aware of "Transaction Mode" limitations. We added `idle_in_transaction_session_timeout` to mitigate stalls.

### 2. Performance & Rate Limiting (`src/web/app.js`)
- **Discord Info Caching:** The Express middleware now caches `server_name` in `req.session`. **DO NOT** remove this, as calling Discord API on every request causes heavy latency and `ETIMEDOUT` on session lookups.

### 3. Live Board Logic (`src/bot/liveboard.js`)
- **Debounce & Queue:** The `updateLiveBoard` function uses a 1.2s debounce and an internal lock (`activeUpdates`) to prevent overlapping Discord message edits. This is vital to stay under Discord rate limits.
- **Grid Layout:** The board uses a 3-column grid via Embed fields. If adding fields, ensure they maintain the `inline: true` and modulo-3 padding logic.

---

## 🛠️ Common Workflows

- **Local Dev:** Uses `.env.local`.
- **Resetting DB:** Use `npm run reset-all` (be careful, it clears transactions/reservations).
- **Deploying Commands:** `node src/bot/deploy-commands.js`.

## ⚠️ Environment Variables
- `DATABASE_URL` / `SUPABASE_DB_URL`: If using Supabase, prefer Direct connection (port 5432) if the Pooler (6543) is unstable.
- `SESSION_SECRET`: Essential for secure session management.

---
*Last Updated: 2026-04-24 by Antigravity AI*
