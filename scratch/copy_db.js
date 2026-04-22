require('dotenv').config({ path: '.env.prod' });
const prodEnv = process.env.SUPABASE_DB_URL;

const fs = require('fs');
// Load local .env (which will be the test DB)
const envConfig = require('dotenv').parse(fs.readFileSync('.env'));
const targetEnv = envConfig.SUPABASE_DB_URL || envConfig.DATABASE_URL;

const { Client } = require('pg');

const TABLES = ['admin_users', 'pages', 'items', 'rounds', 'reservations', 'whitelist', 'round_history_items', 'item_presets', 'lottery_logs'];

async function main() {
  if (!prodEnv || !targetEnv) {
    console.error('Error: Source (from .env.prod) or Target (from .env) DB URL is missing.');
    return;
  }
  
  if (prodEnv === targetEnv) {
    console.error('Error: Source and Target DB URLs are the same! Please update .env with the new test DB URL.');
    return;
  }

  const source = new Client({ connectionString: prodEnv });
  const target = new Client({ connectionString: targetEnv });
  
  await source.connect();
  await target.connect();
  
  console.log('Connected to both databases.');
  
  // 1. Apply Schema
  const schema = fs.readFileSync('./supabase_schema.sql', 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await target.query(stmt);
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('multiple primary keys')) {
        console.warn(`Warning on schema apply: ${e.message}`);
      }
    }
  }
  console.log('Schema applied to target DB.');
  
  // 2. Clear target tables (in reverse order to avoid FK issues)
  for (const table of [...TABLES].reverse()) {
    try {
      await target.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (e) {
      console.log(`Note: TRUNCATE ${table} failed, maybe table is empty or doesn't exist yet.`);
    }
  }
  console.log('Target tables cleared.');
  
  // 3. Copy data
  for (const table of TABLES) {
    let rows;
    try {
      const res = await source.query(`SELECT * FROM ${table}`);
      rows = res.rows;
    } catch (e) {
      console.log(`Skipping table ${table} - not found or error in source.`);
      continue;
    }
    
    if (rows.length === 0) continue;
    
    console.log(`Copying ${rows.length} rows for table ${table}...`);
    
    // Build insert query
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    for (const row of rows) {
      const values = columns.map(col => row[col]);
      await target.query(query, values);
    }
    
    // Update sequence
    try {
      await target.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), coalesce(max(id),0) + 1, false) FROM ${table}`);
    } catch (e) {
      // Ignored if no sequence
    }
  }
  
  console.log('🎉 Database copy complete! Your test database is now a clone of production.');
  
  await source.end();
  await target.end();
}

main().catch(e => console.error(e));
