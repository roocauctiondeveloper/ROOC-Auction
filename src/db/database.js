const { Pool } = require('pg');
// env โหลดที่ src/index.js แล้ว (entry point)

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const isPooler = connectionString && connectionString.includes('pooler');

console.log(`📡 Initializing DB Pool (${isPooler ? 'Pooler' : 'Direct'})`);

// แยกส่วนประกอบของ URL เพื่อความปลอดภัยและป้องกันปัญหาตัวอักษรพิเศษใน Password
const poolConfig = {
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // เพิ่มเป็น 15 วินาที
  keepAlive: true,
  // ตั้งค่าสำหรับ PgBouncer (Transaction Mode)
  statement_timeout: 60000, // 60 วินาที
  idle_in_transaction_session_timeout: 60000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err.message);
});

console.log('⏳ Attempting to connect to database...');
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to Supabase:', err.message);
    if (err.message.includes('ETIMEDOUT')) {
      console.error('💡 สาเหตุอาจมาจาก Network (Render -> Supabase) หรือ DNS');
      console.error('💡 แนะนำ: ลองเปลี่ยน Hostname เป็น Direct Connection (.supabase.co) แทน Pooler (.pooler.supabase.com)');
    }
    return;
  }
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
