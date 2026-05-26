require('dotenv').config();
const db = require('../src/db/database');

async function check() {
  try {
    const res = await db.pool.query(`
      SELECT discord_user_id, COUNT(*)
      FROM whitelist
      GROUP BY discord_user_id
      HAVING COUNT(*) > 1
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
