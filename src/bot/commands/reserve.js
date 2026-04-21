const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../db/queries');

/** hint ท้าย message แนะนำ feature อื่น */
const HINT = '\n\n💡 ดูรายการที่ว่างได้ด้วย `/available` • ดูของที่จองไว้ด้วย `/mystuff`';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reserve')
    .setDescription('จองสินค้าในระบบ')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('หน้าที่ต้องการจอง')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('item')
        .setDescription('ชิ้นที่ต้องการจอง (1-4) — ถ้าไม่ระบุ จะจองทั้งหน้า (เฉพาะ Light-Dark, Time-Space)')
        .setRequired(false)),

  async execute(interaction) {
    const pageNum = interaction.options.getInteger('page');
    const itemNum = interaction.options.getInteger('item');
    const discordUsername = interaction.member
      ? interaction.member.displayName
      : interaction.user.username;
    const discordUserId = interaction.user.id;

    const discordUserId = interaction.user.id;

    // ตรวจสอบสถานะรอบ
    const currentRound = await db.getOrCreateCurrentRound();
    if (currentRound.status !== 'open') {
      return interaction.reply({
        content: `❌ ขณะนี้ยังไม่ได้เปิดรับจอง หรือปิดรับจองไปแล้วครับ${HINT}`,
        ephemeral: true,
      });
    }

    // หา page
    const pages = await db.getAllPages();
    const page = pages.find(p => parseInt(p.name) === pageNum || p.id === pageNum);
    if (!page) {
      const pageList = pages.length > 0
        ? pages.map(p => `• ${p.name}`).join('\n')
        : '(ยังไม่มีหน้าในระบบ)';
      return interaction.reply({
        content: `❌ ไม่พบหน้าที่ **${pageNum}**\n\nหน้าที่มีในระบบ:\n${pageList}${HINT}`,
        ephemeral: true,
      });
    }

    const items = await db.getItemsForPage(page.id);

    if (items.length === 0) {
      return interaction.reply({
        content: `❌ หน้า **${page.name}** ยังไม่มีสินค้าในระบบ${HINT}`,
        ephemeral: true,
      });
    }

    // ── จองรายชิ้น ──────────────────────────────────────────────
    if (itemNum !== null) {
      const item = items.find(i => i.position === itemNum);
      if (!item) {
        const itemList = items.map(i => `• ชิ้นที่ ${i.position} — ${i.item_type}${i.reserved_by ? ` (จองแล้วโดย ${i.reserved_by})` : ' ✅ ว่าง'}`).join('\n');
        return interaction.reply({
          content: `❌ ไม่พบชิ้นที่ **${itemNum}** ในหน้า **${page.name}**\n\nรายการในหน้านี้:\n${itemList}${HINT}`,
          ephemeral: true,
        });
      }

      if (item.reserved_by) {
        return interaction.reply({
          content: `❌ หน้า **${page.name}** ชิ้นที่ ${item.position} (${item.item_type}) ถูกจองไปแล้วโดย **${item.reserved_by}**${HINT}`,
          ephemeral: false,
        });
      }

      // ถ้าเป็น Album ต้องเช็ค Whitelist
      if (item.item_type === 'Album') {
        const isWhitelisted = await db.isWhitelisted(discordUserId);
        if (!isWhitelisted) {
          return interaction.reply({
            content: `❌ **${discordUsername}** ไม่สามารถจอง Album ได้เนื่องจากยังไม่ได้อยู่ใน Whitelist\n\n(ส่วน Light-Dark/Time-Space จองได้ปกติครับ)`,
            ephemeral: true,
          });
        }
      }

      try {
        await db.addReservation(currentRound.id, item.id, discordUserId, discordUsername);
        return interaction.reply({
          content: `✅ **${discordUsername}** จองสำเร็จ!\n📄 หน้า **${page.name}** — ชิ้นที่ ${item.position} (${item.item_type})${HINT}`,
          ephemeral: false,
        });
      } catch (err) {
        if (err.message && (err.message.includes('UNIQUE') || err.code === '23505')) {
          return interaction.reply({
            content: `❌ ชิ้นที่ ${item.position} ถูกจองไปแล้วโดยคนอื่น${HINT}`,
            ephemeral: false,
          });
        }
        console.error('[reserve] single item error:', err);
        return interaction.reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
      }
    }

    // ── จองทั้งหน้า ──────────────────────────────────────────────
    const hasCardBook = items.some(i => i.item_type === 'Album');
    if (hasCardBook) {
      const isWhitelisted = await db.isWhitelisted(discordUserId);
      if (!isWhitelisted) {
        return interaction.reply({
          content: `❌ หน้า **${page.name}** มี Album อยู่ ไม่สามารถจองทั้งหน้าได้หากไม่อยู่ใน Whitelist${HINT}`,
          ephemeral: true,
        });
      }

      const itemList = items.map(i => `• ชิ้นที่ ${i.position} — ${i.item_type}${i.reserved_by ? ` (จองแล้วโดย ${i.reserved_by})` : ' ✅ ว่าง'}`).join('\n');
      return interaction.reply({
        content: `❌ หน้า **${page.name}** มี Album ไม่สามารถจองทั้งหน้าได้\nกรุณาระบุชิ้นที่ต้องการ เช่น \`/reserve page:${pageNum} item:1\`\n\nรายการในหน้านี้:\n${itemList}${HINT}`,
        ephemeral: true,
      });
    }

    const unreservedItems = items.filter(i => !i.reserved_by);

    if (unreservedItems.length === 0) {
      const reservedMsg = items.map(i => `• ชิ้นที่ ${i.position} (${i.item_type}) — จองโดย **${i.reserved_by}**`).join('\n');
      return interaction.reply({
        content: `❌ หน้า **${page.name}** ถูกจองหมดแล้ว\n\n${reservedMsg}${HINT}`,
        ephemeral: false,
      });
    }

    // จองรายการที่ว่าง
    const successItems = [];
    const failItems = [];

    for (const item of unreservedItems) {
      try {
        await db.addReservation(currentRound.id, item.id, discordUserId, discordUsername);
        successItems.push(`ชิ้นที่ ${item.position} (${item.item_type})`);
      } catch (e) {
        failItems.push(`ชิ้นที่ ${item.position} (${item.item_type})`);
      }
    }

    if (successItems.length === 0) {
      return interaction.reply({
        content: `❌ ไม่สามารถจองได้ ทุกชิ้นถูกจองไปแล้ว${HINT}`,
        ephemeral: false,
      });
    }

    let msg = `✅ **${discordUsername}** ยกหน้า **${page.name}** สำเร็จ!\n📦 จองได้: ${successItems.join(', ')}`;
    if (failItems.length > 0) {
      msg += `\n⚠️ จองไม่ได้ (ถูกจองไปแล้ว): ${failItems.join(', ')}`;
    }
    msg += HINT;

    return interaction.reply({ content: msg, ephemeral: false });
  },
};
