const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

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
  let { discord_username, discord_user_id } = req.body;
  if (!discord_user_id) {
    req.session.error_msg = 'กรุณากรอก Discord User ID';
    return res.redirect('/whitelist');
  }

  discord_user_id = discord_user_id.trim();
  discord_username = discord_username ? discord_username.trim() : 'Unknown';

  try {
    await db.addToWhitelist(discord_username, discord_user_id);
    req.session.success_msg = 'เพิ่มรายชื่อสำเร็จ';
  } catch (err) {
    if (err.message.includes('UNIQUE') || (err.code && err.code === '23505')) {
      req.session.error_msg = 'ID นี้มีอยู่ในระบบแล้ว';
    } else {
      req.session.error_msg = 'เกิดข้อผิดพลาดในการเพิ่มรายชื่อ';
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
