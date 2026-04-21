const db = require('../db/database');

async function migrate() {
  console.log('⏳ Starting migration: Add win_count and spin_count to whitelist table...');
  try {
    await db.exec(`
      ALTER TABLE whitelist 
      ADD COLUMN IF NOT EXISTS win_count INTEGER DEFAULT 0;
      ALTER TABLE whitelist 
      ADD COLUMN IF NOT EXISTS spin_count INTEGER DEFAULT 0;
    `);
    console.log('✅ Migration successful: Stats columns added.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
