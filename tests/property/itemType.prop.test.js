const fc = require('fast-check');
const Database = require('better-sqlite3');

describe('Item Type Properties', () => {
    let mockDb;
    let queries;

    beforeEach(() => {
        mockDb = new Database(':memory:');
        mockDb.exec(`
          CREATE TABLE pages (id INTEGER PRIMARY KEY, name TEXT);
          CREATE TABLE items (id INTEGER PRIMARY KEY, page_id INTEGER, name TEXT, item_type TEXT CHECK (item_type IN ('สมุดการ์ด', 'ขนนกขาว', 'ขนนกดำ')), position INTEGER);
        `);
        jest.resetModules();
        jest.mock('../../src/db/database', () => mockDb);
        queries = require('../../src/db/queries');
        mockDb.exec("INSERT INTO pages (name) VALUES ('Page 1')");
    });

    afterEach(() => mockDb.close());

    test('Property 9: invalid item_type value rejected by DB constraint', () => {
        fc.assert(
            fc.property(fc.string().filter(s => !['สมุดการ์ด', 'ขนนกขาว', 'ขนนกดำ'].includes(s)), (invalidType) => {
                expect(() => queries.addItem(1, 'TestItem', invalidType, 1)).toThrow(/CHECK constraint failed/);
            }),
            { numRuns: 100 }
        );
    });
});
