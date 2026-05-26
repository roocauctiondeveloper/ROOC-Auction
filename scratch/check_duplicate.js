require('dotenv').config();
const db = require('../src/db/database');

async function check() {
  try {
    const res = await db.pool.query("SELECT discord_username, win_count, spin_count, created_at FROM whitelist WHERE discord_username IN ('GroWUp', 'Hadas', 'mAnoISus', 'ol2l2o(แซน)', 's0litary', 'Pairnie')");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
