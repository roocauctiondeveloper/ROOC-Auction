const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv });
} else {
  require('dotenv').config();
}

const db = require('../src/db/database');

(async () => {
  try {
    console.log('Checking for duplicate discord_user_id in whitelist...');
    const dups = await db.all(`
      SELECT discord_user_id, COUNT(*) 
      FROM whitelist 
      GROUP BY discord_user_id 
      HAVING COUNT(*) > 1;
    `);
    console.log('Duplicates found:', dups);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
})();
