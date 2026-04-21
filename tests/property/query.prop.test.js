const Database = require('better-sqlite3');

describe('Query Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE, name TEXT, item_type TEXT, position INTEGER, created_at TEXT, UNIQUE(page_id, position));
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT);
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
    });

    afterEach(() => mockDb.close());

    test('Property 24: query filtering returns exact matches', () => {
        mockDb.exec("INSERT INTO pages (name) VALUES ('P1'); INSERT INTO rounds (name) VALUES ('R1'); INSERT INTO items (page_id, name, item_type, position) VALUES (1, 'I1', 'ขนนกขาว', 1);");
        queries.addReservation(1, 1, 'user1', 'User 1');
        
        const currentReservations = queries.getCurrentReservations(1);
        expect(currentReservations.length).toBe(1);
        expect(currentReservations[0].discord_username).toBe('User 1');
    });
});
