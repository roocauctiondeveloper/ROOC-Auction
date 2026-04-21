const db = require('../db/database');

async function migrate() {
  console.log('⏳ Starting migration: Create lottery_logs table...');
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS lottery_logs (
        id SERIAL PRIMARY KEY,
        whitelist_id INTEGER REFERENCES whitelist(id) ON DELETE CASCADE,
        is_winner BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Migration successful: lottery_logs table created.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
