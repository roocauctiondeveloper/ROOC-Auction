const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');
const discordClient = require('../../bot/client');
const { sendLiveBoard, closeLiveBoard } = require('../../bot/liveboard');

const passport = require('passport');

// GET /login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('login');
});

// GET /auth/discord
router.get('/auth/discord', passport.authenticate('discord'));

// GET /auth/discord/callback
router.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/login',
    failureMessage: true
}), (req, res) => {
    res.redirect('/');
});

// POST /logout
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/login');
  });
});

// GET / - Dashboard main
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const round = await db.getOrCreateCurrentRound();
    const reservations = await db.getCurrentReservations();
    const pages = await db.getAllPages();
    const whitelist = await db.getAllWhitelist();
    const presets = await db.getAllPresets();

    // ดึงรายละเอียดแบบละเอียดของแต่ละหน้าสำหรับแสดงผล Overview
    const pagesWithItems = await Promise.all(pages.map(async p => ({
      ...p,
      items: await db.getItemsForPage(p.id)
    })));

    res.render('dashboard', { 
      round, 
      reservationsCount: reservations.length, 
      pagesCount: pages.length,
      whitelistCount: whitelist.length,
      pagesWithItems,
      presets
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// GET /api/dashboard-stats - JSON endpoint for auto-refresh
router.get('/api/dashboard-stats', ensureAuthenticated, async (req, res) => {
  try {
    const round = await db.getOrCreateCurrentRound();
    const reservations = await db.getCurrentReservations();
    const pages = await db.getAllPages();
    const whitelist = await db.getAllWhitelist();

    const pagesWithItems = await Promise.all(pages.map(async p => ({
      ...p,
      items: await db.getItemsForPage(p.id)
    })));

    res.json({
      round,
      reservationsCount: reservations.length,
      pagesCount: pages.length,
      whitelistCount: whitelist.length,
      pagesWithItems
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /round/open
router.post('/round/open', ensureAuthenticated, async (req, res) => {
  try {
    const round = await db.getOrCreateCurrentRound();
    if (round && round.status === 'preparing') {
      await db.updateRoundStatus(round.id, 'open');

      // Auto-assign Whitelist to available Album slots
      const assignedNames = await db.autoAssignWhitelist(round.id);

      // 📢 Live Board
      const channelId = process.env.DISCORD_ANNOUNCE_CHANNEL_ID;
      console.log('📢 Round Open: Attempting to send Live Board. Channel:', channelId);
      if (channelId) {
        const result = await sendLiveBoard(discordClient, channelId, round);
        if (!result) console.warn('⚠️ sendLiveBoard returned null');
      } else {
        console.warn('⚠️ No DISCORD_ANNOUNCE_CHANNEL_ID found in env');
      }

      req.session.success_msg = `เปิดรับจองรอบแล้ว! ${assignedNames.length > 0 ? '(จองให้ Whitelist อัตโนมัติ ' + assignedNames.length + ' คน) ' : ''}ส่ง Live Board ใน Discord แล้ว`;
    }
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการเปิดรอบ';
  }
  res.redirect('/');
});

// POST /round/close
router.post('/round/close', ensureAuthenticated, async (req, res) => {
  try {
    const round = await db.getCurrentRound();
    if (round && round.status === 'open') {
      await db.updateRoundStatus(round.id, 'closed');
      
      // 1. บันทึก Snapshot ลงประวัติ
      await db.saveRoundSnapshot(round.id);
      
      // 2. 🛑 Close Live Board
      await closeLiveBoard(discordClient, round);

      // 3. ล้างรายการหน้าและสินค้าปัจจุบันเพื่อรอรอบใหม่
      await db.deleteAllPages();
      
      req.session.success_msg = 'ปิดการจองในรอบนี้ บันทึกประวัติ และล้างรายการสินค้าสำเร็จ!';
    }

  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการปิดรอบ';
  }
  res.redirect('/');
});

module.exports = router;
