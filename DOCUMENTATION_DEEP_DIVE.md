# Project Documentation: Deep Dive (ROOC-Auction)

## Project Purpose
**ROOC-Auction** is a Discord-based reservation system with a web dashboard for admins. It is built for running auction/reservation rounds where admins prepare item pages, open a round, let users reserve from Discord buttons, then close the round and keep a snapshot history.

The app has two main surfaces:
- **Discord bot:** Shows the live board, handles user reservations, and lets users check/cancel their own reservations.
- **Web dashboard:** Lets admins manage pages, items, rounds, quotas, whitelist members, presets, and history.

## Core Entities

### Rounds (`rounds`)
- The system works in rounds.
- Statuses are `preparing`, `open`, and `closed`.
- A new current round is created automatically when there is no round or the previous round is closed.
- Quotas live on the round:
  - `quota`: click/action limit for feather reservations.
  - `quota_ld`: Light-Dark item quota per user.
  - `quota_ts`: Time-Space item quota per user.
- The live board Discord channel/message ids are also stored on the round.

### Pages (`pages`) and Items (`items`)
- Items are grouped into pages.
- Each page can hold up to 4 item positions.
- Supported item types:
  - `Album`
  - `Illution Box`
  - `Light-Dark`
  - `Time-Space`
- Admin tools and presets generate items in this order: Album, Illution Box, Light-Dark, Time-Space.

### Reservations (`reservations`)
- A reservation links a round, item, Discord user id, and Discord display name.
- The database enforces one reservation per item per round with `UNIQUE (round_id, item_id)`.
- Current behavior allows a user to reserve multiple Light-Dark/Time-Space items according to round quota.
- Album/Illution Box are limited separately: users can have only one Album/Illution Box-style reservation in a round.

### Whitelist (`whitelist`)
- Whitelist members are allowed to reserve Album/Illution Box items.
- Whitelist rows also track lottery stats:
  - `spin_count`
  - `win_count`
  - active/inactive status
- Lottery results are stored in `lottery_logs`.

### Presets (`item_presets`)
- Presets store reusable item counts for quick round setup.
- Applying a preset creates pages/items and sets default LD/TS quotas:
  - LD quota defaults to `floor(light_dark_count / 9)`, minimum 1.
  - TS quota defaults to `floor(time_space_count / 10)`, minimum 1.

## Reservation Rules

### Round State
- Users can reserve only when the current round is `open`.
- Admins prepare pages/items while the round is `preparing`.
- Closing a round snapshots the results, closes the Discord live board, and clears current pages/items for the next round.

### Album / Illution Box
- Requires active whitelist membership.
- A user can reserve only one Album/Illution Box-type item per round.
- On round open, active whitelist members are auto-assigned to available Album/Illution Box slots in order.

### Light-Dark / Time-Space
- These are quota-based bundle reservations.
- `quota_ld` controls how many Light-Dark items a user may hold.
- `quota_ts` controls how many Time-Space items a user may hold.
- `quota` controls the number of feather reservation button actions/click groups.
- Users can cancel their own feather reservations from the success message, `/mystuff`, or the live board My Stuff button.

### Concurrency
- Discord button handlers use in-memory locks in `src/bot/commands/available.js` to reduce duplicate processing.
- Database uniqueness on `(round_id, item_id)` is the final protection against two users reserving the same item.
- Multi-item feather reservations use a transaction in `addMultipleReservations`.

## Live Board Behavior

- The live board is sent when an admin opens a round.
- It shows item status in embed grids and exposes Discord buttons for available LD/TS bundles.
- The board updates existing Discord messages instead of sending a new board every time.
- `src/bot/liveboard.js` caches message payloads and skips edits when content did not change.
- Update calls are guarded with an internal active/pending queue to avoid overlapping edits.
- Discord limits matter:
  - 5 buttons per action row.
  - 25 buttons per message.
  - Embed fields are padded to keep a 3-column grid.

## Web Dashboard

Authentication uses Discord OAuth through Passport. Access is granted when:
- the Discord user id exists in `admin_users`, or
- the id matches `DISCORD_ADMIN_ID`.

Dashboard features:
- Manage pages and page items.
- Bulk setup and bulk add inventory.
- Apply presets.
- Open/close rounds.
- Manually add/cancel reservations.
- Manage whitelist and lottery results.
- View round history snapshots.

## Database and Deployment

- Production is PostgreSQL/Supabase through the `pg` package.
- The app uses a shared Postgres pool from `src/db/database.js`.
- Web sessions use `connect-pg-simple` with the same shared pool when `DATABASE_TYPE=postgres`.
- The project is configured for Docker deployment.
- Important scripts:
  - `npm start` / `npm run dev`: start web dashboard and Discord bot.
  - `npm run deploy-commands`: register Discord slash commands.
  - `npm run add-admin`: add a Discord admin id.
  - `npm run reset-all`: clear reservations, rounds, history, and lottery logs while preserving admins, presets, pages, items, and whitelist.

## Known Maintenance Notes

- Many older comments and tests still contain legacy Thai item names or encoding-damaged text. Treat the current code paths as the source of truth.
- `supabase_schema.sql` is the baseline schema. Some newer columns are also added at runtime by migrations in `src/db/queries.js`.
- Avoid creating extra database pools; Supabase connection limits are tight.
- Be careful when changing live board update logic because Discord rate limits and message component limits shape the implementation.
