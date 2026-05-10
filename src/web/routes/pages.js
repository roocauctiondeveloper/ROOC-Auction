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
  const redirectUrl = req.query.redirect || '/pages';
  res.redirect(redirectUrl);
});

// POST /pages/multiply
router.post('/multiply', async (req, res) => {
  const { percentage } = req.body;
  const pct = parseInt(percentage);

  if (!pct || pct <= 0) {
    req.session.error_msg = 'เปอร์เซ็นต์ต้องมากกว่า 0';
    return res.redirect('/');
  }

  try {
    const round = await db.getOrCreateCurrentRound();
    if (round.status !== 'preparing') {
      req.session.error_msg = 'ต้องอยู่ในสถานะกำลังเตรียมของเท่านั้น';
      return res.redirect('/');
    }

    const allData = await db.getAllBoardData(round.id);
    let currentAlbum = 0;
    let currentLD = 0;
    let currentTS = 0;

    for (const item of allData) {
      const type = item.item_type.toLowerCase();
      if (type === 'album') currentAlbum++;
      else if (type === 'light-dark') currentLD++;
      else if (type === 'time-space') currentTS++;
    }

    const addAlbum = Math.floor(currentAlbum * (pct / 100));
    const addLD = Math.floor(currentLD * (pct / 100));
    const addTS = Math.floor(currentTS * (pct / 100));

    if (addAlbum === 0 && addLD === 0 && addTS === 0) {
      req.session.error_msg = 'เพิ่ม 0 ชิ้น (จำนวนปัจจุบันน้อยเกินไปสำหรับการคำนวณ)';
      return res.redirect('/');
    }

    // ล้างหน้าเก่าทั้งหมดเพื่อจัดเรียงใหม่ทั้งหมด
    await db.deleteAllPages();

    const queue = [];
    const totalAlbum = currentAlbum + addAlbum;
    const totalLD = currentLD + addLD;
    const totalTS = currentTS + addTS;

    for (let i = 0; i < totalAlbum; i++) queue.push('Album');
    for (let i = 0; i < totalLD; i++) queue.push('Light-Dark');
    for (let i = 0; i < totalTS; i++) queue.push('Time-Space');

    const numPages = Math.ceil(queue.length / 4);

    for (let p = 1; p <= numPages; p++) {
      const pageName = p.toString();
      const pageId = await db.addPage(pageName);
      for (let pos = 1; pos <= 4; pos++) {
        if (queue.length === 0) break;
        await db.addItem(pageId, queue.shift(), pos);
      }
    }

    req.session.success_msg = `เพิ่มจำนวนไอเทมอีก ${pct}% และจัดเรียงใหม่สำเร็จ! (+Album: ${addAlbum}, +LD: ${addLD}, +TS: ${addTS} รวมทั้งหมด ${numPages} หน้า)`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการคูณจำนวนสินค้า';
  }
  
  res.redirect('/');
});

module.exports = router;
