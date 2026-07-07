const fc = require('fast-check');
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

describe('Reservation Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER, item_type TEXT, position INTEGER);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT, UNIQUE(round_id, item_id));
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
        mockActiveDb.sqlite.exec("INSERT INTO rounds (id, name) VALUES (1, 'Round 1')");
        mockActiveDb.sqlite.exec("INSERT INTO pages (id, name) VALUES (1, 'Page 1')");
    });

    test('Property 1: reserveItem write correctness', async () => {
        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 100 }), fc.string({ minLength: 1 }), async (itemId, username) => {
                mockActiveDb.sqlite.exec('DELETE FROM items; DELETE FROM reservations;');
                mockActiveDb.sqlite.exec(`INSERT INTO items (id, page_id, item_type, position) VALUES (${itemId}, 1, 'Light-Dark', 1)`);
                
                // First reserve should succeed
                const resId = await queries.addReservation(1, itemId, 'userId', username);
                expect(resId).toBeDefined();

                // Subsequent reserve should throw constraint error
                await expect(async () => {
                    await queries.addReservation(1, itemId, 'otherId', 'OtherUser');
                }).rejects.toThrow(/UNIQUE constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
