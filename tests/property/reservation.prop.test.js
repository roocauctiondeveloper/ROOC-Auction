const fc = require('fast-check');
const Database = require('better-sqlite3');

describe('Reservation Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER, name TEXT, item_type TEXT, position INTEGER);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT, UNIQUE(round_id, item_id));
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
        mockDb.exec("INSERT INTO rounds (name) VALUES ('Round 1')");
        mockDb.exec("INSERT INTO pages (name) VALUES ('Page 1')");
    });

    afterEach(() => mockDb.close());

    test('Property 1: reserveItem write correctness', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 100 }), fc.string({ minLength: 1 }), (itemId, username) => {
                mockDb.exec('DELETE FROM items; DELETE FROM reservations;');
                mockDb.exec(`INSERT INTO items (id, page_id, name, item_type, position) VALUES (${itemId}, 1, 'TestItem', 'ขนนกขาว', 1)`);
                
                // First reserve should succeed
                const resId = queries.addReservation(1, itemId, 'userId', username);
                expect(resId).toBeDefined();

                // Subsequent reserve should throw constraint error
                expect(() => queries.addReservation(1, itemId, 'otherId', 'OtherUser')).toThrow(/UNIQUE constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
