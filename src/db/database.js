const config = require('../config');

let db;

if (config.databaseType === 'postgres') {
  const pg = require('./postgres');
  db = {
    async query(text, params) {
      // Convert SQLite ? to Postgres $1, $2, etc.
      let count = 1;
      const pgText = text.replace(/\?/g, () => `$${count++}`);
      return pg.query(pgText, params);
    },
    async all(text, params) {
      const res = await this.query(text, params);
      return res.rows;
    },
    async get(text, params) {
      const res = await this.query(text, params);
      return res.rows[0];
    },
    async run(text, params) {
      const res = await this.query(text, params);
      // PostgreSQL doesn't return lastInsertRowid in the same way. 
      // We usually need "RETURNING id" in Postgres.
      return { lastInsertRowid: res.rows[0]?.id || null, changes: res.rowCount };
    }
  };
} else {
  // SQLite (better-sqlite3)
  const Database = require('better-sqlite3');
  const path = require('path');
  const sqliteDb = new Database(path.resolve(__dirname, '../../database.sqlite'));
  sqliteDb.pragma('journal_mode = WAL');

  db = {
    async all(text, params = []) {
      return sqliteDb.prepare(text).all(params);
    },
    async get(text, params = []) {
      return sqliteDb.prepare(text).get(params);
    },
    async run(text, params = []) {
      const result = sqliteDb.prepare(text).run(params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    },
    exec(text) {
      return sqliteDb.exec(text);
    }
  };
}

module.exports = db;

