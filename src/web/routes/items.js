const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

router.get('/page/:pageId', async (req, res) => {
  const pageId = req.params.pageId;
  try {
    const pages = await db.getAllPages();
    const page = pages.find(p => p.id == pageId);
    
    if (!page) {
      req.session.error_msg = 'ไม่พบ Page';
      return res.redirect('/pages');
    }

    const items = await db.getItemsForPage(pageId);
    res.render('items', { page, items });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading items');
  }
});

router.post('/page/:pageId', async (req, res) => {
  const pageId = req.params.pageId;
  const { card_count, box_count, white_count, black_count } = req.body;

  const nCard = parseInt(card_count) || 0;
  const nBox = parseInt(box_count) || 0;
  const nWhite = parseInt(white_count) || 0;
  const nBlack = parseInt(black_count) || 0;

  if (nCard + nBox + nWhite + nBlack > 4) {
    req.session.error_msg = 'รวมทุกอย่างแล้วต้องไม่เกิน 4 ชิ้นต่อหน้า';
    return res.redirect(`/items/page/${pageId}`);
  }

  try {
    await db.deleteItemsByPage(pageId);

    let currentPos = 1;
    
    // เรียงตาม Album -> Illution Box -> Light-Dark -> Time-Space
    for (let i = 0; i < nCard; i++) {
      await db.addItem(pageId, 'Album', currentPos++);
    }
    for (let i = 0; i < nBox; i++) {
      await db.addItem(pageId, 'Illution Box', currentPos++);
    }
    for (let i = 0; i < nWhite; i++) {
      await db.addItem(pageId, 'Light-Dark', currentPos++);
    }
    for (let i = 0; i < nBlack; i++) {
      await db.addItem(pageId, 'Time-Space', currentPos++);
    }

    req.session.success_msg = 'อัปเดตรายการสินค้าในหน้านี้สำเร็จ';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการตั้งค่าสินค้า';
  }
  
  res.redirect(`/items/page/${pageId}`);
});

router.post('/page/:pageId/clear', async (req, res) => {
  const pageId = req.params.pageId;
  try {
    await db.deleteItemsByPage(pageId);
    req.session.success_msg = 'ล้างข้อมูลสินค้าในหน้านี้สำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการล้างข้อมูล';
  }
  res.redirect(`/items/page/${pageId}`);
});

router.post('/:id/delete', async (req, res) => {
  const itemId = req.params.id;
  try {
    const item = await db.getItemById(itemId);
    
    if (!item) {
      req.session.error_msg = 'ไม่พบ Item';
      return res.redirect('/pages');
    }

    await db.deleteItem(itemId);
    req.session.success_msg = 'ลบ Item สำเร็จ';
    res.redirect(`/items/page/${item.page_id}`);
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบ Item';
    res.redirect('/pages');
  }
});

module.exports = router;
