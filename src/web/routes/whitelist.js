const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');
const config = require('../../config');
const client = require('../../bot/client');


router.use(ensureAuthenticated);

// GET /whitelist
router.get('/', async (req, res) => {
  try {
    const whitelist = await db.getAllWhitelist();
    res.render('whitelist', { whitelist });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading whitelist');
  }
});

// POST /whitelist
router.post('/', async (req, res) => {
  let { discord_user_id } = req.body;
  if (!discord_user_id) {
    req.session.error_msg = 'กรุณากรอก Discord User ID';
    return res.redirect('/whitelist');
  }

  discord_user_id = discord_user_id.trim();

  try {
    // 1. ลองดึงข้อมูลจาก Server (Guild) ก่อนเพื่อให้ได้ Nickname
    let discord_username = 'Unknown';
    try {
      const guild = await client.guilds.fetch(config.discordGuildId);
      const member = await guild.members.fetch(discord_user_id);
      discord_username = member.displayName; // ใช้ชื่อในเซิร์ฟเวอร์
    } catch (guildErr) {
      // 2. ถ้าไม่เจอในเซิร์ฟเวอร์ ให้ดึงชื่อ Global แทน
      const user = await client.users.fetch(discord_user_id);
      discord_username = user.globalName || user.username;
    }

    await db.addToWhitelist(discord_username, discord_user_id);
    req.session.success_msg = `เพิ่มรายชื่อสำเร็จ: ${discord_username}`;
  } catch (err) {
    console.error('[Whitelist] error:', err);
    if (err.code === 10013 || err.message.includes('Unknown User')) {
      req.session.error_msg = 'ไม่พบผู้ใช้ใน Discord (ID อาจจะไม่ถูกต้อง)';
    } else if (err.message.includes('UNIQUE') || err.code === '23505') {
      req.session.error_msg = 'ID นี้มีอยู่ในระบบแล้ว';
    } else {
      req.session.error_msg = 'เกิดข้อผิดพลาดในการดึงข้อมูลจาก Discord หรือการบันทึก';
    }
  }
  res.redirect('/whitelist');
});



// POST /whitelist/:id/delete
router.post('/:id/delete', async (req, res) => {
  try {
    await db.removeFromWhitelist(req.params.id);
    req.session.success_msg = 'ลบรายชื่อสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบรายชื่อ';
  }
  res.redirect('/whitelist');
});

module.exports = router;
