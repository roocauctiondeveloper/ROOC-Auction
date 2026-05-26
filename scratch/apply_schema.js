const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(localEnv) && process.env.DB_ENV !== 'production') {
  require('dotenv').config({ path: localEnv });
  console.log('📁 Loaded .env.local for database schema');
} else {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  console.log('📁 Loaded .env for database schema');
}
const db = require('../src/db/database');

async function apply() {
  try {
    console.log('Creating tables...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS parties (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS party_members (
          id SERIAL PRIMARY KEY,
          party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
          whitelist_id INTEGER NOT NULL REFERENCES whitelist(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(party_id, whitelist_id)
      );
      
      CREATE TABLE IF NOT EXISTS wheel_entries (
          id SERIAL PRIMARY KEY,
          submitted_by TEXT NOT NULL,
          nominated_1 TEXT,
          nominated_2 TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    // Pre-populate parties if they don't exist
    const partyNames = ['Party 1', 'Party 2', 'Party 3', 'Party 4', 'Party 5', 'Party 6', 'Party 7', 'Party 8', 'Party 9'];
    for (const name of partyNames) {
      await db.run(`INSERT INTO parties (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
    }

    console.log('Schema applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

apply();
