const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(__dirname, '.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv });
} else {
  require('dotenv').config();
}

const db = require('./src/db/database');

async function run() {
  try {
    const transfers = await db.all('SELECT * FROM transfers');
    console.log('--- Database Transfers ---');
    console.log(JSON.stringify(transfers, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit();
}

run();
