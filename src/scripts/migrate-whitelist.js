const db = require('../db/database');

async function migrate() {
  console.log('⏳ Starting migration: Add is_active to whitelist table...');
  try {
    await db.exec(`
      ALTER TABLE whitelist 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
    console.log('✅ Migration successful: is_active column added.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
