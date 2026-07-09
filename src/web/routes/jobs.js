const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

// GET /jobs
router.get('/', async (req, res) => {
  try {
    const whitelist = await db.getAllWhitelistWithParty();
    const logs = await db.getJobChangeLogs();
    
    const ragnarokClasses = [
      'Lord Knight',
      'Paladin',
      'High Priest',
      'Champion',
      'High Wizard',
      'Professor',
      'Sniper',
      'Minstrel',
      'Gypsy',
      'Assassin Cross',
      'Stalker',
      'Mastersmith',
      'Biochemist',
      'Summoner',
      'Rebellion'
    ];

    res.render('jobs', { whitelist, logs, ragnarokClasses });
  } catch (err) {
    console.error('[Jobs Route] error:', err);
    res.status(500).send('Error loading jobs page');
  }
});

// POST /jobs/update
router.post('/update', async (req, res) => {
  const { id, job } = req.body;
  if (!id) {
    req.session.error_msg = 'ข้อมูลไม่ครบถ้วน';
    return res.redirect('/jobs');
  }

  try {
    const adminUserId = req.user.discord_user_id;
    const adminUsername = req.user.server_name || req.user.discord_username || 'Admin';

    await db.updateWhitelistJob(parseInt(id), job || null, adminUserId, adminUsername);
    req.session.success_msg = 'อัปเดตอาชีพสำเร็จ';
  } catch (err) {
    console.error('[Jobs Route Update] error:', err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการอัปเดตอาชีพ';
  }
  res.redirect('/jobs');
});

// POST /jobs/update-api
router.post('/update-api', async (req, res) => {
  const { id, job } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' });
  }

  try {
    const adminUserId = req.user.discord_user_id;
    const adminUsername = req.user.server_name || req.user.discord_username || 'Admin';

    await db.updateWhitelistJob(parseInt(id), job || null, adminUserId, adminUsername);
    
    // Get the newly created log entry
    const logs = await db.getJobChangeLogs();
    const newLog = logs[0];
    
    res.json({ success: true, log: newLog });
  } catch (err) {
    console.error('[Jobs Route Update API] error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการอัปเดตอาชีพ' });
  }
});

module.exports = router;
