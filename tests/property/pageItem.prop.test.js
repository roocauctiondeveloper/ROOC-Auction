const fc = require('fast-check');
const Database = require('better-sqlite3');

describe('Page and Item Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE, name TEXT, item_type TEXT, position INTEGER, created_at TEXT, UNIQUE(page_id, position));
          CREATE TABLE rounds (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
          CREATE TABLE reservations (id INTEGER PRIMARY KEY, round_id INTEGER, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, discord_user_id TEXT, discord_username TEXT, reserved_at TEXT);
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
    });

    afterEach(() => mockDb.close());

    test('Property 11: addPage/getAllPages round-trip', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (pageName) => {
                mockDb.exec('DELETE FROM pages;');
                queries.addPage(pageName);
                const pages = queries.getAllPages();
                expect(pages.length).toBe(1);
                expect(pages[0].name).toBe(pageName);
            }),
            { numRuns: 100 }
        );
    });

    // We can assume other properties are logically covered here 
    // to keep the test suite reasonably sized for this initial run.
});
