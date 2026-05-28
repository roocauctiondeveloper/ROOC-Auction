# ROOC Auction Project Audit

Date: 2026-05-28

This is a discussion-first audit. It records oddities and risks found during a read-through, but it does not mean every item should be changed immediately.

## Executive Summary

The project is functional but has a few maintenance and behavior risks that can surprise admins:

- The runtime is effectively PostgreSQL/Supabase, while tests and some config still assume SQLite.
- Several inventory-edit actions delete and recreate pages/items, which can cascade-delete reservations if used at the wrong time.
- The whitelist lottery behavior recently drifted from "only winners remain active" to "only participants are updated"; this has now been corrected in the working tree.
- Party/wheel data is intentionally persistent, but admins need enough visibility/control to avoid accidental confusion.
- Many comments/messages are mojibake, making future fixes harder and easier to misunderstand.

## Findings

### P1 - Test Suite Is Out Of Sync With Current Database Layer

Evidence:
- `tests/unit/queries.test.js:1` uses `better-sqlite3`.
- `tests/unit/queries.test.js:48` mocks `../../src/db/database` with a raw SQLite instance.
- `src/db/queries.js` now expects wrapper methods like `db.run`, `db.all`, `db.get`, and `db.exec`.

Impact:
- `npm test -- --runInBand` fails before validating meaningful behavior.
- The tests still call older signatures with four arguments, while current code expects `addItem(pageId, itemType, position)`.
- Regressions in core flows can slip through because the test harness no longer represents production.

Discussion:
- Decide whether tests should use a mocked wrapper shaped like `src/db/database.js`, or a dedicated test Postgres database.
- If keeping SQLite tests, introduce a compatibility wrapper instead of mocking raw `better-sqlite3` directly.

### P1 - Inventory Rebuild Actions Can Delete Existing Reservations

Evidence:
- `src/db/queries.js:76` defines `deleteAllPages()` as `DELETE FROM pages`.
- `src/web/routes/pages.js:52`, `111`, `149`, and `199` call `deleteAllPages()`.
- `src/web/routes/items.js:42` and `72` call `deleteItemsByPage()`.
- `reservations.item_id` references `items(id) ON DELETE CASCADE` in `supabase_schema.sql`.

Impact:
- Deleting pages/items also deletes reservations/history linkage for current item rows.
- Some flows guard against open rounds, but not all destructive endpoints have the same status guard.
- Admins can accidentally wipe active or preparing data from pages/items screens.

Discussion:
- Consider centralizing "can edit inventory" checks.
- Consider blocking item/page destructive actions unless the round is `preparing` and has no reservations.
- Consider explicit preview/dry-run counts before destructive actions.

### P1 - Whitelist Active State Rule Was Ambiguous

Evidence:
- Previous `src/web/routes/whitelist.js` logic updated only participants: winners active, participant losers inactive.
- Party flow creates a subset wheel, making old active users outside the wheel remain active.
- Working tree now adds `setOnlyWhitelistActive()` in `src/db/queries.js:417` and calls it from `src/web/routes/whitelist.js:173`.

Impact:
- Before the current fix, opening a round could auto-assign everyone who was still active from earlier state.

Discussion:
- Confirm the rule: after every confirmed wheel result, active whitelist members should be exactly the winners.
- Decide whether manual status toggles should still be allowed after lottery confirmation.

### P2 - Party Wheel Entries Are Persistent By Design, But Need Visibility

Evidence:
- `src/db/queries.js:602` returns all wheel entries ordered by `created_at`.
- `src/web/routes/whitelist.js:189` returns all nominated IDs from all latest entries.
- `src/bot/commands/party.js:95` clears entries for the caller's party before adding a new one.

Impact:
- This persistence is intentional: if a party does not submit updated names, its previous submitted names should continue to be used.
- The risk is not the persistence itself, but that admins may not see clearly which parties are using carried-over submissions.
- There is no explicit admin view/action visible in this read-through for reviewing or clearing carried-over wheel entries.

Discussion:
- Preserve carry-over behavior.
- Show fetched names grouped by party/submitter before spin so carried-over entries are obvious.
- If a reset/clear action is added later, make it explicit and admin-triggered.

### P2 - `DATABASE_TYPE` Default Points To SQLite While DB Code Is PostgreSQL

Evidence:
- `src/config.js:35` defaults `databaseType` to `sqlite`.
- `src/web/app.js:82` uses Postgres sessions only when `DATABASE_TYPE === 'postgres'`.
- `src/db/database.js` always initializes a `pg.Pool`.

Impact:
- If `DATABASE_TYPE` is missing, sessions use SQLite while app data uses Postgres.
- This split can confuse local/dev deployments and makes debugging login/session issues harder.

Discussion:
- Default `DATABASE_TYPE` to `postgres`, or remove the SQLite branch if no longer supported.
- Remove unused SQLite dependencies once tests are migrated.

### P2 - Schema File And Runtime Migrations Are Not Fully Aligned

Evidence:
- `src/db/queries.js:11-13` adds `quota`, `quota_ld`, and `quota_ts` to `rounds` at startup.
- `supabase_schema.sql` defines `rounds` but does not include those quota columns directly.

Impact:
- Fresh database setup depends on app startup migrations after schema apply.
- Manual schema readers may miss required runtime columns.

Discussion:
- Update `supabase_schema.sql` to reflect the current complete schema.
- Move startup migrations into a dedicated migration path or document them clearly.

### P2 - Mojibake In Comments And UI Strings

Evidence:
- Many files show garbled Thai/emoji text when read from the current environment, including `src/web/routes/*.js`, `src/bot/*.js`, and `src/utils/constants.js`.

Impact:
- Harder to understand intent.
- Higher chance of editing the wrong behavior or shipping broken text.

Discussion:
- Normalize source files to UTF-8.
- Prefer English identifiers/comments for code logic and Thai only where user-facing text needs it.

### P3 - Duplicate Logic Across Reservation Displays

Evidence:
- Quota calculations and reservation grouping appear in `src/bot/commands/available.js`, `src/bot/commands/mystuff.js`, and `src/bot/client.js`.

Impact:
- Small behavior changes can be applied in one place and missed in another.
- Cancel and quota messages may drift.

Discussion:
- Extract shared helpers for quota summary, item type normalization, and reservation grouping.

### P3 - Background Username Sync Runs During Whitelist Page Load

Evidence:
- `src/web/routes/whitelist.js` renders the page, then calls `syncWhitelistUsernames(whitelist)` in the background.

Impact:
- Visiting whitelist can trigger many Discord API calls.
- The guard prevents overlap in-process, but there is no rate-limit/backoff strategy.

Discussion:
- Move sync to an explicit admin action or scheduled task.
- Show when sync last ran.

## Verification Notes

Commands run:

- `node --check` over all JS files in `src` and `tests`: passed.
- `npm test -- --runInBand`: failed because the tests mock `src/db/database` as raw `better-sqlite3`, while production code expects the async DB wrapper.
- `git diff --check`: passed after the whitelist active-state fix.

## Suggested Next Conversation

1. Confirm desired lifecycle rules: when pages/items can be edited, how persistent wheel entries should be reviewed, and what active whitelist means.
2. Fix the test harness so it catches regressions again.
3. Add guards around destructive inventory routes.
4. Improve visibility/control for persistent party wheel entries.
5. Normalize schema/config/docs to one database story: Postgres first.
