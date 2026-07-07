const createMockDb = require('../mock-db');

let mockActiveDb;
jest.mock('../../src/db/database', () => ({
  all: (...args) => mockActiveDb.all(...args),
  get: (...args) => mockActiveDb.get(...args),
  run: (...args) => mockActiveDb.run(...args),
  exec: (...args) => mockActiveDb.exec(...args),
  pool: {
    query: (...args) => mockActiveDb.pool.query(...args)
  }
}));

describe('Database Queries', () => {
  let queries;

  beforeEach(() => {
    mockActiveDb = createMockDb();
    mockActiveDb.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_user_id TEXT NOT NULL UNIQUE,
          created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS items (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          item_type  TEXT NOT NULL CHECK (item_type IN ('Album', 'Illution Box', 'Light-Dark', 'Time-Space')),
          position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (page_id, position)
      );
      CREATE TABLE IF NOT EXISTS rounds (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          status     TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'open', 'closed')),
          quota      INTEGER DEFAULT 1,
          quota_ld   INTEGER DEFAULT 1,
          quota_ts   INTEGER DEFAULT 1,
          board_channel_id TEXT,
          board_message_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS reservations (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
          item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          discord_user_id  TEXT NOT NULL,
          discord_username TEXT NOT NULL,
          reserved_at      TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (round_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS whitelist (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_username TEXT NOT NULL,
          discord_user_id  TEXT NOT NULL UNIQUE,
          is_active        BOOLEAN DEFAULT 1,
          win_count        INTEGER DEFAULT 0,
          spin_count       INTEGER DEFAULT 0,
          job              TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    jest.resetModules();
    queries = require('../../src/db/queries');
  });

  test('should create and retrieve pages', async () => {
    const pageId = await queries.addPage('Page 1');
    const pages = await queries.getAllPages();
    expect(pages.length).toBe(1);
    expect(pages[0].name).toBe('Page 1');
    expect(pages[0].id).toBe(pageId);
    expect(pages[0].item_count).toBe(0);
  });

  test('should create items and validate types', async () => {
    const pageId = await queries.addPage('Page 1');
    
    // Add valid item
    const itemId = await queries.addItem(pageId, 'Album', 1);
    expect(itemId).toBeDefined();

    // Should fail with invalid item type
    await expect(async () => {
      await queries.addItem(pageId, 'InvalidType', 2);
    }).rejects.toThrow(/CHECK constraint failed/);
  });

  test('should whitelist members properly', async () => {
    const wId = await queries.addToWhitelist('userX', '111222');
    expect(wId).toBeDefined();
    
    expect(await queries.isWhitelisted('111222')).toBe(true);
    expect(await queries.isWhitelisted('unknownUser')).toBe(false);

    // UNIQUE constraint check
    await expect(async () => {
      await queries.addToWhitelist('userY', '111222');
    }).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
