const db = require('../db/queries');

async function main() {
  const args = process.argv.slice(2);
  const discordId = args[0];

  if (!discordId) {
    console.error('❌ กรุณาระบุ Discord User ID ที่ต้องการเพิ่ม');
    console.log('การใช้งาน: node src/scripts/add-admin.js <ID>');
    process.exit(1);
  }

  try {
    console.log(`⏳ กำลังตรวจสอบ ID: ${discordId}...`);
    
    // เช็คว่ามีอยู่แล้วหรือยัง
    const existing = await db.getAdminByDiscordId(discordId);
    if (existing) {
      console.log('⚠️ ID นี้เป็น Admin อยู่แล้วครับ');
      process.exit(0);
    }

    // เพิ่มเข้า DB
    await db.addAdmin(discordId);
    console.log(`✅ เพิ่ม ID: ${discordId} เป็น Admin เรียบร้อยแล้วครับ!`);
    
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
  } finally {
    process.exit(0);
  }
}

main();
