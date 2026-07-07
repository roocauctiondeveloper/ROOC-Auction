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

describe('Page and Item Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE, item_type TEXT, position INTEGER, created_at TEXT, UNIQUE(page_id, position));
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT);
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
    });

    test('Property 11: addPage/getAllPages round-trip', async () => {
        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1 }), async (pageName) => {
                mockActiveDb.sqlite.exec('DELETE FROM pages;');
                await queries.addPage(pageName);
                const pages = await queries.getAllPages();
                expect(pages.length).toBe(1);
                expect(pages[0].name).toBe(pageName);
            }),
            { numRuns: 100 }
        );
    });
});
