# Instructions for AI Coding Assistant

**Project:** ROOC-Auction (Discord Reservation Bot & Web Dashboard)

Read this before making code changes. This file captures the current architecture and behavior that should not be accidentally regressed.

Also read `CODEX_HANDOFF.md` before making behavior changes. It captures project-owner alignment, current risky areas, and the rules that future Codex sessions should preserve.

## Core Architecture

- **Entry point:** `src/index.js`
  - Loads `.env.local` first for local dev, otherwise `.env`.
  - Validates required config.
  - Starts the Express web dashboard.
  - Logs in the Discord bot after the web server is listening.
- **Database:** PostgreSQL/Supabase through `pg`.
- **Database wrapper:** `src/db/database.js`
  - Exposes SQLite-style helpers (`all`, `get`, `run`, `exec`) over Postgres.
  - Converts `?` placeholders to `$1`, `$2`, etc.
- **Business queries:** `src/db/queries.js`.
- **Bot:** Discord.js v14.
- **Web:** Express + EJS + Passport Discord OAuth.
- **Session store:** `connect-pg-simple` when `DATABASE_TYPE=postgres`.

## Current Product Behavior

### Round Lifecycle

- Rounds can be `preparing`, `open`, or `closed`.
- Admins configure pages/items/presets/quotas while preparing.
- Opening a round:
  - changes status to `open`;
  - auto-assigns active whitelist members to available Album/Illution Box slots;
  - sends the Discord live board to `DISCORD_ANNOUNCE_CHANNEL_ID`.
- Closing a round:
  - changes status to `closed`;
  - snapshots current item/reservation state into `round_history_items`;
  - closes/deletes live board controls;
  - clears current pages/items for the next round.

### Reservation Rules

- Users can reserve only while the current round is `open`.
- `Album` and `Illution Box`:
  - require active whitelist membership;
  - are limited to one Album/Illution Box-type reservation per user per round.
- `Light-Dark` and `Time-Space`:
  - are quota-based bundle reservations;
  - use `quota_ld` and `quota_ts` per user;
  - also respect the round-level `quota` as a feather click/action limit.
- The database enforces one reservation per item per round with `UNIQUE (round_id, item_id)`.
- Do not reintroduce the older rule that a user may have only one reservation total per round. The current behavior intentionally allows multiple LD/TS reservations according to quota.

### Live Board

- Main file: `src/bot/liveboard.js`.
- The board edits existing Discord messages instead of reposting the board.
- It builds embed grids from `getAllBoardData`.
- It builds LD/TS bundle buttons from current availability and round quotas.
- It caches serialized message payloads to avoid unnecessary Discord edits.
- It uses an active/pending update guard so overlapping updates do not fight each other.
- Keep Discord limits in mind: 5 buttons per row, 25 buttons per message, practical embed field limits.

### User Bot Commands

- `/available` shows available LD/TS reservation options and handles live board reservation buttons.
- `/mystuff` shows the user's current reservations and cancellation controls.
- Button handlers in `src/bot/client.js` route cancel actions, My Stuff actions, and reservation actions.

## Database Connection Notes

- Use the shared `Pool` from `src/db/database.js`.
- Do not create a second Postgres pool for sessions or routes.
- Existing pool settings are intentional for Supabase/Render stability:
  - `max: 20`
  - `connectionTimeoutMillis: 15000`
  - `keepAlive: true`
  - statement and idle-in-transaction timeouts
- If using Supabase pooler/PgBouncer, be careful with transaction behavior and prepared statements.

## Web Dashboard Notes

- Authentication is Discord OAuth.
- Admin access comes from `admin_users` or `DISCORD_ADMIN_ID`.
- `src/web/app.js` caches the Discord server display name in the session. Keep this cache because fetching Discord member data on every request can cause slow requests/timeouts.
- Pages/items/presets are admin-managed and generally should only be changed during `preparing`.

## Important Scripts

- `npm start` / `npm run dev`: start the app.
- `npm run deploy-commands`: deploy Discord slash commands.
- `npm run add-admin`: add a Discord admin id.
- `npm run reset-all`: clears reservations, rounds, round history, lottery logs, and resets whitelist stats/status while preserving admins, presets, pages, items, and whitelist rows.

## Known Cleanup Areas

- Some legacy tests reference old command names and old item names. Verify before trusting test failures as product regressions.
- Some comments/messages contain encoding-damaged Thai or emoji. Fix them only when touching related code or when doing a focused copy cleanup.
- `supabase_schema.sql` is a baseline schema; runtime migrations in `src/db/queries.js` add newer round columns.
