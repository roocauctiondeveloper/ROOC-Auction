const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/queries');
const { updateLiveBoard } = require('../liveboard');

const HINT = '\n\n💡 ดูรายการที่ว่างได้ด้วย `/available` • ดูของที่จองไว้ด้วย `/mystuff`';

const DISPLAY = { 
  'Album': '📒 Album', 
  'Light-Dark': '🐔 Light-Dark', 
  'Time-Space': '🐓 Time-Space',
  'light-dark': '🐔 Light-Dark', 
  'time-space': '🐓 Time-Space' 
};
const disp = (t) => DISPLAY[t] ?? t;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reserve')
    .setDescription('จองสินค้าในระบบ')
    .addIntegerOption(o =>
      o.setName('page').setDescription('หน้าที่ต้องการจอง').setRequired(true))
    .addIntegerOption(o =>
      o.setName('item').setDescription('ชิ้นที่ต้องการจอง (1-4) — ถ้าไม่ระบุ จะจองทั้งหน้า (Light-Dark/Time-Space)').setRequired(false)),

  async execute(interaction) {
    const pageNum = interaction.options.getInteger('page');
    const itemNum = interaction.options.getInteger('item');
    const discordUsername = interaction.member?.displayName ?? interaction.user.username;
    const discordUserId = interaction.user.id;

    // ตรวจสอบสถานะรอบ
    const currentRound = await db.getOrCreateCurrentRound();
    if (currentRound.status !== 'open') {
      return interaction.reply({
        content: `❌ ขณะนี้ยังไม่ได้เปิดรับจอง หรือปิดรับจองไปแล้วครับ${HINT}`,
        ephemeral: true,
      });
    }

    const myReservations = await db.getMyReservations(discordUserId, currentRound.id);
    if (myReservations.length > 0) {
      return interaction.reply({
        content: `❌ **${discordUsername}** คุณได้จองไปแล้วในรอบนี้ (จำกัดคนละ 1 สิทธิ์)\n💡 หากต้องการเปลี่ยนรายการ กรุณายกเลิกของเก่าด้วยคำสั่ง \`/unreserve\``,
        ephemeral: true,
      });
    }



    // หา page
    const pages = await db.getAllPages();
    const page = pages.find(p => parseInt(p.name) === pageNum || p.id === pageNum);
    if (!page) {
      const pageList = pages.length > 0 ? pages.map(p => `• ${p.name}`).join('\n') : '(ยังไม่มีหน้าในระบบ)';
      return interaction.reply({
        content: `❌ ไม่พบหน้าที่ **${pageNum}**\n\nหน้าที่มีในระบบ:\n${pageList}${HINT}`,
        ephemeral: true,
      });
    }

    const items = await db.getItemsForPage(page.id);
    if (items.length === 0) {
      return interaction.reply({ content: `❌ หน้า **${page.name}** ยังไม่มีสินค้าในระบบ${HINT}`, ephemeral: true });
    }

    // ── จองรายชิ้น ────────────────────────────────────────────────
    if (itemNum !== null) {
      const item = items.find(i => i.position === itemNum);
      if (!item) {
        const list = items.map(i => `• ชิ้นที่ ${i.position} — ${disp(i.item_type)}${i.reserved_by ? ` (จองแล้วโดย ${i.reserved_by})` : ' ✅ ว่าง'}`).join('\n');
        return interaction.reply({ content: `❌ ไม่พบชิ้นที่ **${itemNum}** ในหน้า **${page.name}**\n\n${list}${HINT}`, ephemeral: true });
      }

      if (item.reserved_by) {
        return interaction.reply({ content: `❌ หน้า **${page.name}** ชิ้นที่ ${item.position} (${disp(item.item_type)}) ถูกจองไปแล้วโดย **${item.reserved_by}**`, ephemeral: true });
      }


      // Album ต้องเช็ค Whitelist
      if (item.item_type === 'Album') {
        const ok = await db.isWhitelisted(discordUserId);
        if (!ok) {
          return interaction.reply({ content: `❌ **${discordUsername}** ไม่สามารถจอง Album ได้ (ต้องอยู่ใน Whitelist)\n\nLight-Dark / Time-Space จองได้ปกติครับ`, ephemeral: true });
        }
      }

      try {
        await db.addReservation(currentRound.id, item.id, discordUserId, discordUsername);
        
        // 📢 Update Live Board
        await updateLiveBoard(interaction.client, currentRound.id);

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองนี้').setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ 
          content: `✅ จองสำเร็จ! **${discordUsername}** จองหน้า **${page.name}** ชิ้นที่ ${item.position}\n💡 หากต้องการยกเลิก ให้กดปุ่มด้านล่างหรือพิมพ์ \`/unreserve\``, 
          components: [row],
          ephemeral: true 
        });


      } catch (err) {
        if (err.message?.includes('unique') || err.message?.includes('UNIQUE') || err.code === '23505') {
          return interaction.reply({ content: `❌ ชิ้นที่ ${item.position} ถูกจองไปแล้วโดยคนอื่น`, ephemeral: true });
        }

        console.error('[reserve] error:', err);
        return interaction.reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
      }
    }

    // ── จองทั้งหน้า ───────────────────────────────────────────────
    const hasAlbum = items.some(i => i.item_type === 'Album');
    if (hasAlbum) {
      const list = items.map(i => `• ชิ้นที่ ${i.position} — ${disp(i.item_type)}${i.reserved_by ? ` (จองแล้วโดย ${i.reserved_by})` : ' ✅ ว่าง'}`).join('\n');
      return interaction.reply({
        content: `❌ หน้า **${page.name}** มี Album ไม่สามารถจองทั้งหน้าได้\nกรุณาระบุชิ้น เช่น \`/reserve page:${pageNum} item:1\`\n\n${list}${HINT}`,
        ephemeral: true,
      });
    }

    const unreserved = items.filter(i => !i.reserved_by);
    if (unreserved.length === 0) {
      const msg = items.map(i => `• ชิ้นที่ ${i.position} (${disp(i.item_type)}) — จองโดย **${i.reserved_by}**`).join('\n');
      return interaction.reply({ content: `❌ หน้า **${page.name}** ถูกจองหมดแล้ว\n\n${msg}`, ephemeral: true });
    }


    const success = [], fail = [];
    for (const item of unreserved) {
      try {
        await db.addReservation(currentRound.id, item.id, discordUserId, discordUsername);
        success.push(`ชิ้นที่ ${item.position} (${disp(item.item_type)})`);
      } catch { fail.push(`ชิ้นที่ ${item.position}`); }
    }

    if (success.length === 0) {
      return interaction.reply({ content: '❌ ไม่สามารถจองได้ ทุกชิ้นถูกจองไปแล้ว', ephemeral: true });
    }


    // 📢 Update Live Board
    await updateLiveBoard(interaction.client, currentRound.id);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองนี้').setStyle(ButtonStyle.Danger)
    );

    let out = `✅ **${discordUsername}** ยกหน้า **${page.name}** สำเร็จ!\n📦 ${success.join(', ')}\n💡 หากต้องการยกเลิก ให้กดปุ่มหรือพิมพ์ \`/unreserve\``;
    if (fail.length > 0) out += `\n⚠️ จองไม่ได้: ${fail.join(', ')}`;

    return interaction.reply({ content: out, components: [row], ephemeral: true });


  },
};
