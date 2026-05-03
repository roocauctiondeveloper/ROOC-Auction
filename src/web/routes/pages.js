const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

// GET /pages
router.get('/', async (req, res) => {
  try {
    const pages = await db.getAllPages();
    res.render('pages', { pages });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading pages');
  }
});

// POST /pages
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    req.session.error_msg = 'กรุณาระบุชื่อ Page';
    return res.redirect('/pages');
  }
  
  try {
    await db.addPage(name);
    req.session.success_msg = 'เพิ่ม Page สำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการเพิ่ม Page';
  }
  res.redirect('/pages');
});

// POST /pages/bulk-setup
router.post('/bulk-setup', async (req, res) => {
  const { card_total, white_total, black_total } = req.body;
  
  const nCard = parseInt(card_total) || 0;
  const nWhite = parseInt(white_total) || 0;
  const nBlack = parseInt(black_total) || 0;
  
  const totalItems = nCard + nWhite + nBlack;
  if (totalItems === 0) {
    req.session.error_msg = 'กรุณาระบุจำนวนสินค้าอย่างน้อย 1 ชิ้น';
    return res.redirect('/pages');
  }

  try {
    // 1. ล้างข้อมูลเก่าทั้งหมด
    await db.deleteAllPages(); 

    // 2. สร้างรายการสินค้าทั้งหมดใส่ Array ไว้เพื่อเตรียมแจกจ่ายลงหน้า
    const allItemsList = [];
    for (let i = 0; i < nCard; i++) allItemsList.push('Album');
    for (let i = 0; i < nWhite; i++) allItemsList.push('light-dark');
    for (let i = 0; i < nBlack; i++) allItemsList.push('time-space');

    // 3. สร้าง Pages และใส่ Items (หน้าละ 4 ชิ้น)
    const numPages = Math.ceil(totalItems / 4);
    
    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString()); // ชื่อหน้าเป็นเลข 1, 2, 3...
      
      for (let pos = 1; pos <= 4; pos++) {
        if (allItemsList.length === 0) break;
        const itemType = allItemsList.shift();
        await db.addItem(pageId, itemType, pos);
      }
    }
    
    req.session.success_msg = `สร้างระบบเรียบร้อย: ทั้งหมด ${numPages} หน้า และสินค้า ${totalItems} ชิ้น`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการ Setup ระบบ';
  }
  
  res.redirect('/pages');
});

// POST /pages/:id/delete
router.post('/:id/delete', async (req, res) => {
  try {
    await db.deletePage(req.params.id);
    req.session.success_msg = 'ลบ Page สำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบ Page';
  }
  res.redirect('/pages');
});

// POST /pages/delete-all
router.post('/delete-all', async (req, res) => {
  try {
    await db.deleteAllPages();
    req.session.success_msg = 'ลบทุกหน้าและสินค้าทั้งหมดสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบทั้งหมด';
  }
  res.redirect('/pages');
});

module.exports = router;
