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

    // Helper: สร้างไอเทมลงหน้า
    async function setupItems(count, type, startPageNum) {
      let currentIdx = 0;
      let pageNum = startPageNum;
      
      while (currentIdx < count) {
        const pageName = `${type} หน้าที่ ${pageNum}`;
        const pageId = await db.addPage(pageName);
        
        // ใส่หน้าละ 10 ชิ้นตามมาตรฐาน
        const itemsToCreate = Math.min(10, count - currentIdx);
        for (let i = 1; i <= itemsToCreate; i++) {
          await db.addItem(pageId, type, i);
          currentIdx++;
        }
        pageNum++;
      }
      return pageNum;
    }

    // ทำทีละอย่าง
    if (preset.album_count > 0) await setupItems(preset.album_count, 'Album', 1);
    if (preset.light_dark_count > 0) await setupItems(preset.light_dark_count, 'Light-Dark', 1);
    if (preset.time_space_count > 0) await setupItems(preset.time_space_count, 'Time-Space', 1);

    req.session.success_msg = `Apply Preset "${preset.name}" สำเร็จ! สร้างไอเทมทั้งหมดให้เรียบร้อยแล้ว`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการ Apply Preset';
  }
  res.redirect('/');
});

module.exports = router;
