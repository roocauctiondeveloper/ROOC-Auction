# 📘 Project Documentation: Deep Dive (ROOC-Auction)

## 🌟 Project Purpose
**ROOC-Auction** is a high-concurrency item reservation system designed for Discord communities (specifically for game-related auctions or giveaways). It provides a seamless bridge between a Discord bot (for user interactions) and a Web Dashboard (for administrative management).

---

## 🏗️ Core Entities & Data Model

### 1. Rounds (`rounds`)
- The system operates in "Rounds". Only one round can be **'open'** at a time.
- Statuses: `preparing`, `open`, `closed`.
- Each round captures its own set of reservations.

### 2. Pages (`pages`) & Items (`items`)
- Items are grouped into "Pages".
- **Item Types**:
    - `Album`: Premium items (Restricted to Whitelisted users).
    - `Light-Dark` / `Time-Space`: Common items (Open to everyone).
- Items have a `position` on their page.

### 3. Reservations (`reservations`)
- Links a `user`, an `item`, and a `round`.
- **Primary Rule:** A user can have **ONLY ONE** active reservation per round across all categories.

### 4. Whitelist (`whitelist`)
- A list of Discord IDs allowed to reserve "Album" items.
- Track `spin_count` and `win_count` (used for lottery-style giveaways).

---

## 📜 Business Rules & Logic Constraints

### 🛡️ Reservation Logic (The most critical part)
- **Concurrency:** When multiple users click the same button, the system uses a dual-layer lock:
    1. **In-Memory Lock:** `activeLocks` (Set) in `available.js` prevents the same item/page from being processed twice simultaneously.
    2. **Database Transaction:** `addMultipleReservations` uses a SQL Transaction to ensure all items in a page are reserved or none are.
- **Validation Steps:**
    1. Check if the Round is `open`.
    2. Check if the user already has a reservation in this round.
    3. For `Album` items, check if the user is in the `whitelist`.
    4. Check if the item is still available.

### 📊 Live Board Behavior
- A persistent message in a designated Discord channel.
- **Dynamic Updates:** Edits existing messages instead of sending new ones to keep the channel clean.
- **Debouncing:** Updates are delayed by 1.2s and queued to prevent Discord rate limits.
- **Structure:**
    - `EMB`: Embeds showing item grids.
    - `ALB/LD/TS`: Dedicated messages for buttons (grouped by type).

---

## 💻 Web Dashboard Features
- **Authentication:** Discord OAuth2. Only users in the `admin_users` table can access.
- **Session Management:** Uses `connect-pg-simple`. Session data is shared in the same PG Pool as the app to avoid connection leaks.
- **Features:**
    - Create/Delete Pages & Items.
    - Start/Stop Rounds (Snapshotting history on close).
    - Whitelist management (Add/Remove/Toggle).
    - Presets for quick page/item generation.

---

## 🚀 Technical Constraints & "Gotchas"

### 1. Discord UI Limits
- **Buttons:** Max 25 buttons per message.
- **Select Menus:** Used as a fallback if a category has more than 25 items.
- **Embeds:** Max 25 fields. The system automatically splits pages into multiple embeds (bubbles) if necessary.

### 2. Database (PostgreSQL/Supabase)
- **Connection Limits:** Supabase (free tier) has strict limits. We use a **Shared Pool** with `max: 20` and `keepAlive: true`.
- **PgBouncer:** Since we use the pooler (port 6543), **Transactions** must be handled carefully, and **Prepared Statements** should be avoided or limited.

### 3. Performance
- **Caching:** Discord member information (nicknames) is cached in the web session to prevent redundant slow API calls.
- **N+1 Queries:** `getAllBoardData` uses a single optimized JOIN query to fetch the entire board state at once.

---
## 🛠️ Maintenance & Development
- **Log Monitoring:** Look for `📡 Initializing DB Pool` to verify the connection method.
- **Adding Items:** Use the Dashboard "Presets" to quickly generate standardized item sets.
- **Emergency Reset:** `npm run reset-all` clears all dynamic data but preserves admins and presets.

---
*Documented by Antigravity AI - 2026-04-24*
