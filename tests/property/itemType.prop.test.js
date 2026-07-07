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

describe('Item Type Properties', () => {
    let queries;

    beforeEach(() => {
        mockActiveDb = createMockDb();
        mockActiveDb.sqlite.exec(`
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER, item_type TEXT CHECK (item_type IN ('Album', 'Illution Box', 'Light-Dark', 'Time-Space')), position INTEGER);
        `);
        jest.resetModules();
        queries = require('../../src/db/queries');
        mockActiveDb.sqlite.exec("INSERT INTO pages (id, name) VALUES (1, 'Page 1')");
    });

    test('Property 9: invalid item_type value rejected by DB constraint', async () => {
        await fc.assert(
            fc.asyncProperty(fc.string().filter(s => !['Album', 'Illution Box', 'Light-Dark', 'Time-Space'].includes(s)), async (invalidType) => {
                await expect(async () => {
                    await queries.addItem(1, invalidType, 1);
                }).rejects.toThrow(/CHECK constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
