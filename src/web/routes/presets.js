const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /presets - List all presets
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const presets = await db.getAllPresets();
    res.render('presets', { presets });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

// POST /presets/add
router.post('/add', ensureAuthenticated, async (req, res) => {
  try {
    const { name, album, ld, ts } = req.body;
    await db.addPreset(name, parseInt(album) || 0, parseInt(ld) || 0, parseInt(ts) || 0);
    req.session.success_msg = `สร้าง Preset "${name}" สำเร็จ!`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการสร้าง Preset';
  }
  res.redirect('/presets');
});

// POST /presets/delete/:id
router.post('/delete/:id', ensureAuthenticated, async (req, res) => {
  try {
    await db.deletePreset(req.params.id);
    req.session.success_msg = 'ลบ Preset สำเร็จ!';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'ลบไม่สำเร็จ';
  }
  res.redirect('/presets');
});

// POST /presets/apply/:id - THE MAGIC BUTTON
router.post('/apply/:id', ensureAuthenticated, async (req, res) => {
  try {
    const preset = await db.getPresetById(req.params.id);
    if (!preset) throw new Error('Preset not found');

    const round = await db.getOrCreateCurrentRound();
    if (round.status !== 'preparing') {
      req.session.error_msg = 'กรุณาปิดรอบเก่าก่อน หรือต้องอยู่ในสถานะกำลังเตรียมของเท่านั้น';
      return res.redirect('/');
    }

    // สร้าง queue ของ items เรียงต่อกัน: Album → Light-Dark → Time-Space
    const queue = [];
    for (let i = 0; i < preset.album_count;      i++) queue.push('Album');
    for (let i = 0; i < preset.light_dark_count; i++) queue.push('Light-Dark');
    for (let i = 0; i < preset.time_space_count; i++) queue.push('Time-Space');

    if (queue.length === 0) {
      req.session.error_msg = 'Preset นี้ไม่มีไอเทม';
      return res.redirect('/');
    }

    // ยัดหน้าละ 4 ชิ้นต่อเนื่อง ไม่แยก type
    const numPages = Math.ceil(queue.length / 4);
    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString());
      for (let pos = 1; pos <= 4; pos++) {
        if (queue.length === 0) break;
        await db.addItem(pageId, queue.shift(), pos);
      }
    }

    req.session.success_msg = `Apply Preset "${preset.name}" สำเร็จ! สร้าง ${numPages} หน้า รวม ${preset.album_count + preset.light_dark_count + preset.time_space_count} ชิ้น`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการ Apply Preset';
  }
  res.redirect('/');
});

module.exports = router;
