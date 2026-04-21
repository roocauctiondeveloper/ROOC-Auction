const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');
const discordClient = require('../../bot/client');
const { updateLiveBoard } = require('../../bot/liveboard');

router.use(ensureAuthenticated);

// GET /reservations
router.get('/', async (req, res) => {
  try {
    const reservations = await db.getCurrentReservations();
    const pages = await db.getAllPages();
    const whitelist = await db.getAllWhitelist();
    
    // Collect all items across pages to show in dropdown
    const allItems = [];
    const itemsPromises = pages.map(page => db.getItemsForPage(page.id));
    const itemsResults = await Promise.all(itemsPromises);

    for (let i = 0; i < pages.length; i++) {
        const items = itemsResults[i];
        const page = pages[i];
        for (const item of items) {
            if (!item.reserved_by) {
                allItems.push({ ...item, page_name: page.name });
            }
        }
    }

    res.render('reservations', { reservations, pages, whitelist, availableItems: allItems });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading reservations');
  }
});

// POST /reservations
router.post('/', async (req, res) => {
  const { item_id, discord_user_id } = req.body;
  if (!item_id || !discord_user_id) {
    req.session.error_msg = 'ข้อมูลไม่ครบถ้วน';
    return res.redirect('/reservations');
  }

  try {
    const currentRound = await db.getOrCreateCurrentRound();
    const isReserved = await db.isItemReserved(currentRound.id, item_id);
    
    if (isReserved) {
        req.session.error_msg = 'Item นี้ถูกจองไปแล้ว';
        return res.redirect('/reservations');
    }

    // Find username from whitelist if possible
    const users = await db.getAllWhitelist();
    const user = users.find(u => u.discord_user_id === discord_user_id);
    const discord_username = user ? user.discord_username : 'Manual Reservation';

    await db.addReservation(currentRound.id, item_id, discord_user_id, discord_username);

    // 📢 Update Live Board
    await updateLiveBoard(discordClient, currentRound.id);

    req.session.success_msg = 'เพิ่มข้อมูลการจองสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการเพิ่มข้อมูลการจอง';
  }
  
  res.redirect('/reservations');
});

// POST /reservations/:id/delete
router.post('/:id/delete', async (req, res) => {
  try {
    await db.deleteReservation(req.params.id);

    // 📢 Update Live Board
    const currentRound = await db.getCurrentRound();
    if (currentRound) {
      await updateLiveBoard(discordClient, currentRound.id);
    }

    req.session.success_msg = 'ลบข้อมูลการจองสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบข้อมูลการจอง';
  }
  res.redirect('/reservations');
});

module.exports = router;
