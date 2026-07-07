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

describe('Whitelist Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE whitelist (id INTEGER PRIMARY KEY, discord_username TEXT, discord_user_id TEXT UNIQUE, is_active BOOLEAN DEFAULT 1, created_at TEXT);
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
    });

    test('Property 7: addToWhitelist/isWhitelisted/removeFromWhitelist round-trip', async () => {
        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (username, userId) => {
                mockActiveDb.sqlite.exec('DELETE FROM whitelist;');
                
                // Add
                const id = await queries.addToWhitelist(username, userId);
                expect(id).toBeDefined();

                // Check
                expect(await queries.isWhitelisted(userId)).toBe(true);

                // Remove
                await queries.removeFromWhitelist(id);

                // Check again
                expect(await queries.isWhitelisted(userId)).toBe(false);
            }),
            { numRuns: 100 }
        );
    });

    test('Property 8: duplicate whitelist entry rejected', async () => {
        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (username, userId) => {
                mockActiveDb.sqlite.exec('DELETE FROM whitelist;');
                
                await queries.addToWhitelist(username, userId);
                
                // Add again should throw constraint error
                await expect(async () => {
                    await queries.addToWhitelist('OtherUsername', userId);
                }).rejects.toThrow(/UNIQUE constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
