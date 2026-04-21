const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err, client, release) => {
  if (err) return console.error('❌ Error connecting to Supabase:', err.stack);
  console.log('✅ Connected to Supabase (PostgreSQL)');
  release();
});

/**
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
 */
function toPostgres(sql) {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

const db = {
  /** Returns array of rows */
  async all(sql, params = []) {
    const res = await pool.query(toPostgres(sql), params);
    return res.rows;
  },

  /** Returns first row or undefined */
  async get(sql, params = []) {
    const res = await pool.query(toPostgres(sql), params);
    return res.rows[0];
  },

  /**
   * Run INSERT/UPDATE/DELETE.
   * For INSERT use "... RETURNING id" to get lastInsertRowid.
   */
  async run(sql, params = []) {
    const res = await pool.query(toPostgres(sql), params);
    return {
      lastInsertRowid: res.rows[0]?.id ?? null,
      changes: res.rowCount,
    };
  },

  /** Run raw SQL (schema init etc.) */
  async exec(sql) {
    await pool.query(sql);
  },

  /** Expose pool for transactions */
  pool,
};

module.exports = db;
