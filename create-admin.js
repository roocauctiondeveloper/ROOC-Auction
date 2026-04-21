const db = require('./src/db/queries');

const adminIds = process.argv.slice(2);

if (adminIds.length === 0) {
  console.log('❌ กรุณาระบุ Discord User ID อย่างน้อย 1 ไอดี');
  console.log('👉 วิธีใช้งาน: node create-admin.js <Discord_User_ID_1> <Discord_User_ID_2> ...');
  process.exit(1);
}

async function run() {
  for (const adminId of adminIds) {
    try {
      // Check if already exists
      const existing = await db.getAdminByDiscordId(adminId);
      if (existing) {
        console.log(`⚠️ User ID: ${adminId} เป็น Admin อยู่แล้ว (ข้าม)`);
      } else {
        await db.addAdmin(adminId);
        console.log(`🎉 เพิ่ม Admin สำเร็จ! User ID: ${adminId}`);
      }
    } catch (error) {
      console.error(`❌ เกิดข้อผิดพลาดกับไอดี ${adminId}:`, error.message);
    }
  }
  console.log('✅ ดำเนินการเสร็จสิ้น!');
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
