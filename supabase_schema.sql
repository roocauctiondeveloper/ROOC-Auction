-- Supabase / Postgres Schema for ROOC Auction

-- 1. Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id              SERIAL PRIMARY KEY,
    discord_user_id TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Pages
CREATE TABLE IF NOT EXISTS pages (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Items (สูงสุด 4 ชิ้นต่อ Page)
CREATE TABLE IF NOT EXISTS items (
    id         SERIAL PRIMARY KEY,
    page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    item_type  TEXT NOT NULL CHECK (item_type IN ('Album', 'Light-Dark', 'Time-Space')),
    position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (page_id, position)
);

-- 4. Rounds
CREATE TABLE IF NOT EXISTS rounds (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'open', 'closed')),
    board_channel_id TEXT,
    board_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 5. Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id               SERIAL PRIMARY KEY,
    round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    discord_user_id  TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    reserved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (round_id, item_id)
);

-- 6. Whitelist
CREATE TABLE IF NOT EXISTS whitelist (
    id               SERIAL PRIMARY KEY,
    discord_username TEXT NOT NULL UNIQUE,
    discord_user_id  TEXT,
    is_active        BOOLEAN DEFAULT true,
    win_count        INTEGER DEFAULT 0,
    spin_count       INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Round History Items (Snapshot)
CREATE TABLE IF NOT EXISTS round_history_items (
    id               SERIAL PRIMARY KEY,
    round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    page_name        TEXT NOT NULL,
    item_type        TEXT NOT NULL,
    item_pos         INTEGER NOT NULL,
    discord_user_id  TEXT,           -- NULL if not reserved
    discord_username TEXT,           -- NULL if not reserved
    reserved_at      TIMESTAMPTZ     -- NULL if not reserved
);

-- 8. Item Presets
CREATE TABLE IF NOT EXISTS item_presets (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    album_count      INTEGER NOT NULL,
    light_dark_count INTEGER NOT NULL,
    time_space_count INTEGER NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Lottery Logs
CREATE TABLE IF NOT EXISTS lottery_logs (
    id               SERIAL PRIMARY KEY,
    whitelist_id     INTEGER NOT NULL REFERENCES whitelist(id) ON DELETE CASCADE,
    is_winner        BOOLEAN NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Session Store (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
