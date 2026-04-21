const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
mockDb.pragma('journal_mode = WAL');

mockDb.exec(`
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
      name       TEXT NOT NULL,
      item_type  TEXT NOT NULL CHECK (item_type IN ('สมุดการ์ด', 'ขนนกขาว', 'ขนนกดำ')),
      position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (page_id, position)
  );
  CREATE TABLE IF NOT EXISTS rounds (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
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
      discord_username TEXT NOT NULL UNIQUE,
      discord_user_id  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

jest.mock('../../src/db/database', () => mockDb);

const queries = require('../../src/db/queries');

describe('Database Queries', () => {
  beforeEach(() => {
    mockDb.exec('DELETE FROM reservations; DELETE FROM rounds; DELETE FROM items; DELETE FROM pages; DELETE FROM whitelist; DELETE FROM admin_users;');
  });

  test('should create and retrieve pages', () => {
    const pageId = queries.addPage('Page 1');
    const pages = queries.getAllPages();
    expect(pages.length).toBe(1);
    expect(pages[0].name).toBe('Page 1');
    expect(pages[0].id).toBe(pageId);
    expect(pages[0].item_count).toBe(0);
  });

  test('should create items and validate types', () => {
    const pageId = queries.addPage('Page 1');
    
    // Add valid item
    const itemId = queries.addItem(pageId, 'Item A', 'ขนนกขาว', 1);
    expect(itemId).toBeDefined();

    // Should fail with invalid item type
    expect(() => {
      queries.addItem(pageId, 'Item B', 'InvalidType', 2);
    }).toThrow(/CHECK constraint failed/);
  });

  test('should whitelist members properly', () => {
    const wId = queries.addToWhitelist('userX', '111222');
    expect(wId).toBeDefined();
    
    expect(queries.isWhitelisted('userX')).toBe(true);
    expect(queries.isWhitelisted('unknownUser')).toBe(false);

    expect(() => {
        queries.addToWhitelist('userX', '333444');
    }).toThrow(/UNIQUE constraint failed/);
  });
});
