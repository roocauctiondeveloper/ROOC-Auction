const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv });
} else {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
}

const db = require('../src/db/database');

async function run() {
  try {
    const logs = await db.all('SELECT id, round_id, sender_name, recipient_name, amount, slip_url, completed_at FROM transfer_logs');
    console.log('--- Database transfer_logs (Brief) ---');
    console.log(JSON.stringify(logs, null, 2));

    const transfers = await db.all('SELECT id, round_id, sender_name, recipient_name, status, created_at FROM transfers WHERE status = \'completed\'');
    console.log('--- Database transfers (Brief - Completed Only) ---');
    console.log(JSON.stringify(transfers, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
  process.exit();
}

run();
