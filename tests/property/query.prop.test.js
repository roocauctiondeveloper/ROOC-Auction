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

describe('Query Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, status TEXT DEFAULT 'preparing', created_at TEXT);
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE, item_type TEXT, position INTEGER, created_at TEXT, UNIQUE(page_id, position));
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT, transferred_from_name TEXT, transferred_to_id TEXT, transferred_to_name TEXT);
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
    });

    test('Property 24: query filtering returns exact matches', async () => {
        mockActiveDb.sqlite.exec("INSERT INTO pages (id, name) VALUES (1, 'P1'); INSERT INTO rounds (id, name, status) VALUES (1, 'R1', 'open'); INSERT INTO items (id, page_id, item_type, position) VALUES (1, 1, 'Light-Dark', 1);");
        await queries.addReservation(1, 1, 'user1', 'User 1');
        
        const currentReservations = await queries.getCurrentReservations();
        expect(currentReservations.length).toBe(1);
        expect(currentReservations[0].discord_username).toBe('User 1');
    });
});
