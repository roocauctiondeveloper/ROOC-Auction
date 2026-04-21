const fc = require('fast-check');
const Database = require('better-sqlite3');

describe('History Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT);
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
    });

    afterEach(() => mockDb.close());

    test('Property 19: deleteRoundHistory removes only targeted round', () => {
        mockDb.exec("INSERT INTO rounds (id, name) VALUES (1, 'Round 1'), (2, 'Round 2')");
        
        queries.deleteRoundHistory(1);
        
        const history = queries.getHistoryByRound();
        expect(history.length).toBe(1);
        expect(history[0].id).toBe(2);
    });
});
