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

describe('History Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, status TEXT DEFAULT 'preparing', created_at TEXT);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT);
          CREATE TABLE round_history_items (
              id               INTEGER PRIMARY KEY AUTOINCREMENT,
              round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
              page_name        TEXT NOT NULL,
              item_type        TEXT NOT NULL,
              item_pos         INTEGER NOT NULL,
              discord_user_id  TEXT,
              discord_username TEXT,
              reserved_at      TEXT
          );
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
    });

    test('Property 19: deleteRoundHistory removes only targeted round', async () => {
        mockActiveDb.sqlite.exec("INSERT INTO rounds (id, name, status) VALUES (1, 'Round 1', 'closed'), (2, 'Round 2', 'closed')");
        
        await queries.deleteRoundHistory(1);
        
        const history = await queries.getHistoryByRound();
        expect(history.length).toBe(1);
        expect(history[0].id).toBe(2);
    });
});
