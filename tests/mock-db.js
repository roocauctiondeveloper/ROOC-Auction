const Database = require('better-sqlite3');

function createMockDb() {
  const mockSqlite = new Database(':memory:');
  mockSqlite.pragma('journal_mode = WAL');

  const dbWrapper = {
    sqlite: mockSqlite,
    async all(sql, params = []) {
      const sqlNormalized = sql
        .replace(/\$([0-9]+)/g, '?')
        .replace(/=\s*ANY\(\?::int\[\]\)/gi, 'IN (?)')
        .replace(/::[a-zA-Z0-9\[\]]+/g, '');
      try {
        return mockSqlite.prepare(sqlNormalized).all(...params);
      } catch (err) {
        console.error(`Mock DB error on SQL: ${sqlNormalized} with params ${JSON.stringify(params)}`, err);
        throw err;
      }
    },
    async get(sql, params = []) {
      const sqlNormalized = sql
        .replace(/\$([0-9]+)/g, '?')
        .replace(/::[a-zA-Z0-9\[\]]+/g, '');
      try {
        return mockSqlite.prepare(sqlNormalized).get(...params);
      } catch (err) {
        console.error(`Mock DB error on SQL: ${sqlNormalized} with params ${JSON.stringify(params)}`, err);
        throw err;
      }
    },
    async run(sql, params = []) {
      const sqlNormalized = sql
        .replace(/\$([0-9]+)/g, '?')
        .replace(/::[a-zA-Z0-9\[\]]+/g, '');

      try {
        if (/returning\s+/i.test(sqlNormalized)) {
          const sqlWithoutReturning = sqlNormalized.replace(/returning\s+\w+/i, '');
          const info = mockSqlite.prepare(sqlWithoutReturning).run(...params);
          return {
            lastInsertRowid: info.lastInsertRowid,
            changes: info.changes
          };
        }
        const info = mockSqlite.prepare(sqlNormalized).run(...params);
        return {
          lastInsertRowid: info.lastInsertRowid,
          changes: info.changes
        };
      } catch (err) {
        console.error(`Mock DB error on SQL: ${sqlNormalized} with params ${JSON.stringify(params)}`, err);
        throw err;
      }
    },
    async exec(sql) {
      const sqlNormalized = sql
        .replace(/\$([0-9]+)/g, '?')
        .replace(/::[a-zA-Z0-9\[\]]+/g, '');
      try {
        mockSqlite.exec(sqlNormalized);
      } catch (err) {
        console.error(`Mock DB error on SQL: ${sqlNormalized}`, err);
        throw err;
      }
    },
    pool: {
      async query(sql, params = []) {
        const sqlNormalized = sql
          .replace(/\$([0-9]+)/g, '?')
          .replace(/::[a-zA-Z0-9\[\]]+/g, '');
        try {
          const rows = mockSqlite.prepare(sqlNormalized).all(...params);
          return { rows, rowCount: rows.length };
        } catch (err) {
          try {
            const info = mockSqlite.prepare(sqlNormalized).run(...params);
            return { rows: [], rowCount: info.changes };
          } catch (runErr) {
            console.error(`Mock DB pool.query error on SQL: ${sqlNormalized}`, runErr);
            throw runErr;
          }
        }
      }
    }
  };

  return dbWrapper;
}

module.exports = createMockDb;
