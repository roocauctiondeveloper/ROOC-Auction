# Codex Handoff Notes

Purpose: read this before changing ROOC-Auction. This file captures the shared understanding between the project owner and Codex so future work does not accidentally change product rules.

Last updated: 2026-05-28

## What This App Is

ROOC-Auction is a Discord reservation bot plus an admin web dashboard.

Admins prepare an auction/reservation round in the web dashboard, open the round, users reserve items from Discord buttons, then admins close the round and keep a history snapshot.

The app is not a generic ecommerce cart. It is a round-based reservation tool with very specific item rules.

## Current Runtime Reality

- Production database is PostgreSQL/Supabase via `src/db/database.js`.
- `src/db/database.js` exposes helper methods shaped like SQLite (`all`, `get`, `run`, `exec`) but executes Postgres queries.
- `src/db/queries.js` is the main business query layer.
- The old SQLite test setup and some config names still exist. Do not assume tests are trustworthy until the DB test harness is fixed.
- Web sessions should use Postgres when `DATABASE_TYPE=postgres`.

## Core Business Rules

### Rounds

- A round is `preparing`, `open`, or `closed`.
- Admins should prepare pages/items/presets/quotas before opening.
- Users can reserve only while the round is `open`.
- Opening a round auto-assigns active whitelist members to available Album/Illution Box slots.
- Closing a round snapshots current items/reservations, closes the live board, then clears current pages/items for the next round.

### Items

Supported item types:

- `Album`
- `Illution Box`
- `Light-Dark`
- `Time-Space`

Pages hold up to 4 item positions.

Inventory rebuild flows are risky because deleting pages/items cascades into reservations. Before changing routes that call `deleteAllPages`, `deleteItemsByPage`, or `deleteItem`, check round state and reservation impact.

### Reservations

- Database uniqueness on `(round_id, item_id)` is the final protection against double booking.
- `Light-Dark` and `Time-Space` use per-user quotas from `rounds.quota_ld` and `rounds.quota_ts`.
- `rounds.quota` is a feather click/action limit.
- Do not restore the old rule that a user can only reserve one item total per round.
- Album/Illution Box are special book-like items and are limited separately.

### Whitelist And Wheel

This is a key alignment point.

- Whitelist `is_active` means "eligible for Album/Illution Box auto-assignment when a round opens".
- After a wheel result is confirmed, active whitelist members should be exactly the winners.
- Non-winners and people not in the wheel should not remain active just because they were active before.
- Manual active toggles may still be used by admins, but lottery confirmation should produce a clean final state.

Recent context:

- The party feature made the wheel often contain only a subset of whitelist members.
- Older lottery apply logic updated only participants, so old active users outside the wheel could stay active.
- The current working tree fixes this with `setOnlyWhitelistActive(winnerIds)`.

### Parties

- `/party` lets a user submit up to 2 names from their own party into `wheel_entries`.
- The web whitelist page can fetch current wheel entries and select those whitelist rows.
- `wheel_entries` are intentionally persistent.
- If a party does not submit updated names, the system should keep using that party's previous submitted names.
- Do not automatically clear party wheel entries just because a new round starts.
- If adding a clear/reset action later, make it explicit and admin-triggered so it does not break this carry-over behavior.

## Important Files

- `src/index.js`: app entrypoint, env loading, web server start, Discord login.
- `src/config.js`: environment config.
- `src/db/database.js`: Postgres pool and query wrapper.
- `src/db/queries.js`: business data access.
- `src/web/app.js`: Express, sessions, Passport, route mounting.
- `src/web/routes/auth.js`: dashboard, round open/close.
- `src/web/routes/pages.js`: page/inventory rebuild flows.
- `src/web/routes/items.js`: per-page item edits.
- `src/web/routes/whitelist.js`: whitelist, wheel apply, wheel entries fetch.
- `src/web/routes/parties.js`: party management dashboard.
- `src/bot/client.js`: Discord interaction router.
- `src/bot/commands/available.js`: reservation command and reservation button logic.
- `src/bot/commands/mystuff.js`: user's reservation summary.
- `src/bot/commands/party.js`: party wheel submission command.
- `src/bot/liveboard.js`: live board rendering and updating.
- `supabase_schema.sql`: baseline schema, but not fully aligned with runtime migrations yet.
- `PROJECT_AUDIT.md`: discussion-first list of current risks/oddities.

## Things To Be Careful With

### Do Not Trust The Current Test Suite Blindly

`npm test` currently fails because tests mock the DB as raw `better-sqlite3`, while production code expects the async wrapper methods.

Use these checks for now:

- `node --check` for edited JavaScript files.
- focused manual reasoning for DB behavior.
- after fixing test harness, restore proper Jest coverage.

### Destructive Inventory Routes Need Extra Caution

Routes that rebuild or clear inventory may delete pages/items. Because reservations reference items with `ON DELETE CASCADE`, this can delete reservations.

Before modifying these flows, answer:

- Is the current round `preparing`, `open`, or `closed`?
- Are there existing reservations?
- Should the admin be blocked, warned, or allowed?

### Live Board Edits Are Rate-Limit Sensitive

`src/bot/liveboard.js` edits existing Discord messages and has caching plus active/pending update guards. Avoid naive reposting or frequent edits.

### Encoding Is Messy

Many existing comments and some strings appear as mojibake in the current environment. Avoid broad encoding rewrites mixed with behavior changes. If cleanup is needed, do it as a focused task.

## Preferred Working Style For Future Codex

1. Read this file, `AI_INSTRUCTIONS.md`, and relevant route/query files before editing.
2. When behavior is ambiguous, summarize the inferred rule and confirm before making broad changes.
3. Keep fixes narrow. This project has many coupled flows.
4. Treat admin workflows as high-impact because one click can affect reservations.
5. After changes, report:
   - files changed,
   - business behavior changed,
   - verification run,
   - tests that could not be trusted or could not run.

## Current Known Priorities

From the latest audit:

1. Fix DB test harness so tests represent Postgres wrapper behavior.
2. Add/centralize guards for destructive inventory editing.
3. Improve visibility/control for party `wheel_entries` without breaking intentional carry-over behavior.
4. Align `supabase_schema.sql`, runtime migrations, and config defaults.
5. Clean encoding issues only as a separate focused pass.
