require('dotenv').config({ path: './.env.local' });
require('dotenv').config();

const db = require('../src/db/queries');

async function check() {
  try {
    const parties = await db.getAllParties();
    console.log("=== Parties in DB (Raw Order) ===");
    console.table(parties);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
