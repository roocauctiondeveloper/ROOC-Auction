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

// POST /whitelist/:id/toggle
router.post('/:id/toggle', async (req, res) => {
  try {
    const { is_active } = req.body;
    await db.toggleWhitelistStatus(req.params.id, is_active === 'true');
    req.session.success_msg = 'อัปเดตสถานะสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการอัปเดตสถานะ';
  }
  res.redirect('/whitelist');
});

// POST /whitelist/lottery-apply
router.post('/lottery-apply', async (req, res) => {
  try {
    const { winners } = req.body; // Array of IDs
    const winnerIds = Array.isArray(winners) ? winners : [winners];
    const allMembers = await db.getAllWhitelist();
    const allIds = allMembers.map(m => m.id);
    
    const losersIds = allIds.filter(id => !winnerIds.includes(id.toString()));

    // บันทึกสถิติ: ทุกคนที่มีชื่อในวงล้อถือว่าได้ Spin +1, คนชนะได้ Win +1
    await db.recordLotteryResults(allIds, winnerIds);

    // บันทึกผลสถานะ: คนชนะเป็น Active คนแพ้เป็น Inactive
    await db.bulkUpdateWhitelistStatus(winnerIds, true);
    await db.bulkUpdateWhitelistStatus(losersIds, false);


    req.session.success_msg = 'บันทึกผลการสุ่มเรียบร้อยแล้ว!';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการบันทึกผลการสุ่ม';
  }
  res.redirect('/whitelist');
});


// GET /whitelist/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const member = await db.getWhitelistMemberById(req.params.id);
    if (!member) return res.redirect('/whitelist');

    const history = await db.getMemberLotteryHistory(req.params.id);
    res.render('member_history', { member, history });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading member history');
  }
});

module.exports = router;

