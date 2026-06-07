/**
 * clone-presets-prod-to-local.js
 *
 * ดึง item_presets จาก PROD Supabase แล้ว overwrite ลง LOCAL Supabase
 * PROD  = .env          (sqalzgyrdhognybvsbeb)
 * LOCAL = .env.local    (hznyfgrdnxeyswkjctwj)
 */

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// ─── Parse .env files manually ────────────────────────────────────────────────
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

const rootDir = path.join(__dirname, '..');
const prodEnv  = parseEnvFile(path.join(rootDir, '.env'));
const localEnv = parseEnvFile(path.join(rootDir, '.env.local'));

const PROD_URL  = prodEnv.SUPABASE_DB_URL  || prodEnv.DATABASE_URL;
const LOCAL_URL = localEnv.SUPABASE_DB_URL || localEnv.DATABASE_URL;

if (!PROD_URL || !LOCAL_URL) {
  console.error('❌ ไม่พบ DATABASE_URL ใน .env หรือ .env.local');
  process.exit(1);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const prod  = new Client({ connectionString: PROD_URL,  ssl: { rejectUnauthorized: false } });
  const local = new Client({ connectionString: LOCAL_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log('🔌 Connecting to PROD...');
    await prod.connect();

    console.log('🔌 Connecting to LOCAL...');
    await local.connect();

    // 1. ดึงข้อมูลจาก PROD
    const { rows: presets } = await prod.query(
      'SELECT name, album_count, illution_box_count, light_dark_count, time_space_count FROM item_presets ORDER BY id ASC'
    );
    console.log(`\n📦 พบ ${presets.length} preset ใน PROD:`);
    presets.forEach((p, i) =>
      console.log(`   ${i + 1}. "${p.name}" | Album=${p.album_count} | Box=${p.illution_box_count} | LD=${p.light_dark_count} | TS=${p.time_space_count}`)
    );

    if (presets.length === 0) {
      console.log('\n⚠️  PROD ไม่มี preset เลย — ยกเลิกการทำงาน');
      return;
    }

    // 2. ลบข้อมูลเก่าใน LOCAL
    console.log('\n🗑️  Deleting all presets in LOCAL...');
    const { rowCount: deleted } = await local.query('DELETE FROM item_presets');
    console.log(`   ลบไปแล้ว ${deleted} แถว`);

    // Reset sequence ให้ id เริ่มจาก 1
    await local.query("SELECT setval(pg_get_serial_sequence('item_presets', 'id'), 1, false)");

    // 3. Insert ข้อมูลจาก PROD
    console.log('\n📥 Inserting presets into LOCAL...');
    for (const p of presets) {
      await local.query(
        `INSERT INTO item_presets (name, album_count, illution_box_count, light_dark_count, time_space_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [p.name, p.album_count, p.illution_box_count, p.light_dark_count, p.time_space_count]
      );
      console.log(`   ✅ "${p.name}"`);
    }

    // 4. ยืนยันผลลัพธ์
    const { rows: verify } = await local.query('SELECT * FROM item_presets ORDER BY id ASC');
    console.log(`\n🎉 สำเร็จ! LOCAL มี ${verify.rows?.length ?? verify.length} preset แล้ว`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await prod.end().catch(() => {});
    await local.end().catch(() => {});
    console.log('\n🔌 ปิด connection แล้ว');
  }
}

main();
