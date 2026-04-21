const fc = require('fast-check');
const Database = require('better-sqlite3');

describe('Whitelist Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE whitelist (id INTEGER PRIMARY KEY, discord_username TEXT UNIQUE, discord_user_id TEXT, created_at TEXT);
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
    });

    afterEach(() => mockDb.close());

    test('Property 7: addToWhitelist/isWhitelisted/removeFromWhitelist round-trip', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (username) => {
                mockDb.exec('DELETE FROM whitelist;');
                
                // Add
                const id = queries.addToWhitelist(username, null);
                expect(id).toBeDefined();

                // Check
                expect(queries.isWhitelisted(username)).toBe(true);

                // Remove
                queries.removeFromWhitelist(id);

                // Check again
                expect(queries.isWhitelisted(username)).toBe(false);
            }),
            { numRuns: 100 }
        );
    });

    test('Property 8: duplicate whitelist entry rejected', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (username) => {
                mockDb.exec('DELETE FROM whitelist;');
                
                queries.addToWhitelist(username, null);
                
                // Add again should throw constraint error
                expect(() => queries.addToWhitelist(username, null)).toThrow(/UNIQUE constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
