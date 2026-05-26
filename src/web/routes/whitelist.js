const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');
const config = require('../../config');
const client = require('../../bot/client');


router.use(ensureAuthenticated);

let isSyncing = false;

async function syncWhitelistUsernames(whitelist) {
  if (isSyncing) return;
  isSyncing = true;
  console.log('[Sync] Starting background whitelist username sync...');
  
  try {
    const guild = await client.guilds.fetch(config.discordGuildId);
    if (!guild) {
      console.warn('[Sync] Discord guild not found');
      isSyncing = false;
      return;
    }
    
    for (const member of whitelist) {
      if (!member.discord_user_id) continue;
      
      try {
        let currentUsername = '';
        try {
          const discordMember = await guild.members.fetch(member.discord_user_id);
          currentUsername = discordMember.displayName; // ใช้ชื่อเล่นในเซิร์ฟเวอร์
        } catch (guildErr) {
          // ถ้าไม่เจอในเซิร์ฟเวอร์ ให้ดึงชื่อ Global แทน
          const user = await client.users.fetch(member.discord_user_id);
          currentUsername = user.globalName || user.username;
        }

        if (currentUsername && currentUsername !== member.discord_username) {
          try {
            console.log(`[Sync] Updating username for ID ${member.discord_user_id}: "${member.discord_username}" -> "${currentUsername}"`);
            await db.updateWhitelistUsername(member.id, currentUsername);
            await db.updateUserReservationsUsername(member.discord_user_id, currentUsername);
          } catch (dbErr) {
            console.warn(`[Sync] Could not update username for ${member.discord_user_id} (possibly duplicate):`, dbErr.message);
          }
        }
      } catch (userErr) {
        console.error(`[Sync] Failed to sync user ${member.discord_user_id}:`, userErr.message);
      }
    }
  } catch (err) {
    console.error('[Sync] Whitelist sync failed:', err.message);
  } finally {
    isSyncing = false;
    console.log('[Sync] Background whitelist username sync completed.');
  }
}

// GET /whitelist
router.get('/', async (req, res) => {
  try {
    const whitelist = await db.getAllWhitelist();
    res.render('whitelist', { whitelist });
    
    // ดำเนินการซิงก์ชื่อ Discord ล่าสุดใน Background โดยไม่หน่วงเวลาการโหลดหน้าเว็บ
    syncWhitelistUsernames(whitelist).catch(err => console.error('[Sync] Error:', err));
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
    // Check if this discord_user_id already exists in the whitelist database
    const allWhitelist = await db.getAllWhitelist();
    const existing = allWhitelist.find(w => w.discord_user_id === discord_user_id);
    if (existing) {
      req.session.error_msg = `เลข ID Discord นี้มีอยู่ในระบบแล้ว (ภายใต้ชื่อ: ${existing.discord_username})`;
      return res.redirect('/whitelist');
    }
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
    const { winners, participants } = req.body; 
    
    // มั่นใจว่าเป็น Array ของตัวเลขเสมอ
    let winnerIds = (Array.isArray(winners) ? winners : (winners ? [winners] : [])).map(id => parseInt(id));
    let participantIds = (Array.isArray(participants) ? participants : (participants ? [participants] : [])).map(id => parseInt(id));

    // กรองค่าที่ไม่ใช่ตัวเลขออก
    winnerIds = winnerIds.filter(id => !isNaN(id));
    participantIds = participantIds.filter(id => !isNaN(id));

    // Fallback: ถ้าคนร่วมสุ่มว่าง แต่คนชนะมีค่า (ป้องกันกรณี Error จากหน้าเว็บ)
    // ให้ถือว่าคนชนะคือคนร่วมสุ่มด้วยเลย
    if (participantIds.length === 0 && winnerIds.length > 0) {
      console.warn('[Lottery] Participants empty but winners present. Using winners as participants.');
      participantIds = [...winnerIds];
    }

    if (participantIds.length === 0) {
      console.error('[Lottery] No participants found in JSON body:', req.body);
      return res.status(400).json({ error: 'ไม่พบรายชื่อผู้เข้าร่วม' });
    }
    
    const losersIds = participantIds.filter(id => !winnerIds.includes(id));

    // บันทึกสถิติ: เฉพาะคนที่มีชื่อในวงล้อจริงๆ เท่านั้น
    await db.recordLotteryResults(participantIds, winnerIds);

    // บันทึกผลสถานะ: เฉพาะคนที่เข้าร่วมรอบนี้
    // คนชนะเป็น Active คนที่เข้าวงล้อแต่แพ้เป็น Inactive
    if (winnerIds.length > 0) await db.bulkUpdateWhitelistStatus(winnerIds, true);
    if (losersIds.length > 0) await db.bulkUpdateWhitelistStatus(losersIds, false);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกผลการสุ่ม' });
  }
});


// GET /whitelist/wheel-latest
router.get('/wheel-latest', async (req, res) => {
  try {
    const entries = await db.getLatestWheelEntries();
    // We expect nominated_1 and nominated_2 to be whitelist_ids stored as strings/numbers
    const nominatedIds = new Set();
    for (const entry of entries) {
      if (entry.nominated_1) nominatedIds.add(parseInt(entry.nominated_1));
      if (entry.nominated_2) nominatedIds.add(parseInt(entry.nominated_2));
    }
    res.json({ ids: Array.from(nominatedIds).filter(id => !isNaN(id)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch wheel entries' });
  }
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

