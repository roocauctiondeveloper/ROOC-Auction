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
    console.log('Inspecting whitelist table constraints...');
    const constraints = await db.all(`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.conrelid = 'whitelist'::regclass;
    `);
    console.log('Constraints:', constraints);

    console.log('Inspecting whitelist table indexes...');
    const indexes = await db.all(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'whitelist';
    `);
    console.log('Indexes:', indexes);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
})();
