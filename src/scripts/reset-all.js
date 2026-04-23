const db = require('../db/database');

async function masterReset() {
  console.log('⚠️  WARNING: Starting Master Reset...');
  console.log('   จะลบข้อมูล Transaction ทั้งหมด แต่จะเก็บ Admin, Preset, Pages, Items และ Whitelist ไว้');

  try {
    // 1. ล้างการจองทั้งหมด
    await db.exec('DELETE FROM reservations;');
    console.log('✅ Cleared all reservations.');

    // 2. ล้างประวัติ Snapshot ของแต่ละ Round
    await db.exec('DELETE FROM round_history_items;');
    console.log('✅ Cleared all round history items (snapshot).');

    // 3. ล้าง Round ทั้งหมด (รวม board_message_id ที่แคชไว้ใน Discord)
    await db.exec('DELETE FROM rounds;');
    console.log('✅ Cleared all rounds (including Discord board message cache).');

    // 4. ล้าง Lottery Logs
    await db.exec('DELETE FROM lottery_logs;');
    console.log('✅ Cleared all lottery logs.');

    // 5. รีเซ็ตสถิติแต้มดวงใน Whitelist ให้เป็น 0 และตั้งทุกคนเป็น Active
    await db.exec('UPDATE whitelist SET win_count = 0, spin_count = 0, is_active = true;');
    console.log('✅ Reset all whitelist statistics and set everyone to ACTIVE.');

    // ⛔ ไม่ลบ: admin_users, item_presets, pages, items, whitelist
    console.log('\n⛔ Preserved: admin_users, item_presets, pages, items, whitelist');

    console.log('\n✨ MASTER RESET COMPLETE! ระบบพร้อมสำหรับเริ่มใช้งานจริงแล้วครับ');

  } catch (err) {
    console.error('❌ Reset failed:', err.message);
  } finally {
    process.exit(0);
  }
}

masterReset();
