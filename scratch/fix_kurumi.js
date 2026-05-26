require('dotenv').config();
const db = require('../src/db/database');

async function fix() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Delete the duplicate (id 112)
    // Wait, first let's delete them from party_members if they were added
    await client.query('DELETE FROM party_members WHERE whitelist_id = 112');
    
    // 2. Update the old one (id 59) to be active and have the new name
    await client.query("UPDATE whitelist SET is_active = true, discord_username = 'Kurumi' WHERE id = 59");
    
    // 3. Delete the new one
    await client.query("DELETE FROM whitelist WHERE id = 112");
    
    await client.query('COMMIT');
    console.log("✅ Fix applied successfully.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error applying fix:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

fix();
