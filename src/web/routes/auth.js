const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');
const discordClient = require('../../bot/client');

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
      
      // Announce to discord
      const channelId = process.env.DISCORD_ANNOUNCE_CHANNEL_ID;
      if (channelId) {
        try {
          const channel = await discordClient.channels.fetch(channelId);
          if (channel && channel.isTextBased()) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            // ดึงรายการที่ว่างทั้งหมดเพื่อแสดงใน embed
            const availableItems = await db.getAvailableItems(round.id);
            const grouped = new Map();
            for (const item of availableItems) {
              if (!grouped.has(item.page_name)) grouped.set(item.page_name, []);
              grouped.get(item.page_name).push(item);
            }

            const embed = new EmbedBuilder()
              .setTitle(`🎉 เปิดรับจอง — ${round.name}`)
              .setColor(0x57F287)
              .setDescription(
                '**รายการที่ว่างอยู่ในขณะนี้**\n' +
                'พิมพ์ `/available` เพื่อดูรายการและจองได้เลย!\n' +
                'หรือ `/reserve page:<หน้า> item:<ชิ้น>` ถ้ารู้ตำแหน่งแล้ว'
              )
              .setTimestamp();

            if (grouped.size > 0) {
              for (const [pageName, items] of grouped) {
                const lines = items.map(i => `ชิ้นที่ ${i.position} — ${i.item_type}`);
                embed.addFields({ name: `📄 ${pageName}`, value: lines.join('\n'), inline: true });
              }
            } else {
              embed.addFields({ name: 'รายการ', value: 'ยังไม่มีสินค้าในระบบ', inline: false });
            }

            embed.setFooter({ text: `รวม ${availableItems.length} รายการ • ใช้ /mystuff เพื่อดูของที่จองไว้` });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('noop_available_hint')
                .setLabel('พิมพ์ /available เพื่อจอง')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📋')
                .setDisabled(true)  // disabled เพราะ slash command ต้องพิมพ์เอง
            );

            await channel.send({ embeds: [embed], components: [row] });
          }
        } catch (err) {
          console.error('Failed to announce auction opening on Discord:', err);
        }
      }
      
      req.session.success_msg = 'เปิดรับจองรอบเข้าแล้ว แจ้งเตือนใน Discord แล้ว (ถ้าตั้งค่าช่องไว้)!';
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
      
      // 1. บันทึก Snapshot ลงประวัติไว้ก่อน (รวมรายการที่ว่างด้วย)
      await db.saveRoundSnapshot(round.id);
      
      // 2. ล้างรายการหน้าและสินค้าปัจจุบันเพื่อรอรอบใหม่
      await db.deleteAllPages();
      
      req.session.success_msg = 'ปิดการจองในรอบนี้ บันทึกประวัติ และล้างรายการสินค้าเพื่อรอรอบใหม่สำเร็จ!';
      
      const channelId = process.env.DISCORD_ANNOUNCE_CHANNEL_ID;
      if (channelId) {
        try {
          const channel = await discordClient.channels.fetch(channelId);
          if (channel && channel.isTextBased()) {
            await channel.send(`🛑 **ปิดรับจองประมูล ${round.name} แล้ว!**\nไม่สามารถทำรายการเพิ่มได้แล้วครับ`);
          }
        } catch (err) {
          // ignore block
        }
      }
    }
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการปิดรอบ';
  }
  res.redirect('/');
});

module.exports = router;
