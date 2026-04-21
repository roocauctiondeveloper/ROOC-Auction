const db = require('../db/database');

async function masterReset() {
  console.log('⚠️  WARNING: Starting Master Reset... This will clear ALL data except the Whitelist names.');
  
  try {
    // 1. ล้างการจองทั้งหมด
    await db.exec('DELETE FROM reservations;');
    console.log('✅ Cleared all reservations.');

    // 2. ล้างประวัติการประมูล
    await db.exec('DELETE FROM history;');
    console.log('✅ Cleared all auction history.');

    // 3. ล้างประวัติการสุ่ม (Lottery Logs)
    await db.exec('DELETE FROM lottery_logs;');
    console.log('✅ Cleared all lottery logs.');

    // 4. รีเซ็ตสถิติแต้มดวงใน Whitelist ให้เป็น 0 และตั้งทุกคนเป็น Active
    await db.exec('UPDATE whitelist SET win_count = 0, spin_count = 0, is_active = true;');
    console.log('✅ Reset all whitelist statistics and set everyone to ACTIVE.');

    // 5. ล้าง Cache ข้อความ Live Board ใน Discord
    await db.exec('DELETE FROM round_message_ids;');
    console.log('✅ Cleared Discord message cache.');

    console.log('\n✨ MASTER RESET COMPLETE! ระบบพร้อมสำหรับเริ่มใช้งานจริงแล้วครับ');
    
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
  } finally {
    process.exit(0);
  }
}

masterReset();
