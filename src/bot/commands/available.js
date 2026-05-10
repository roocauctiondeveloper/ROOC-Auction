const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../../db/queries');
const { BRANDING, FEATHER_TYPES, ICONS } = require('../../utils/constants');
const { updateLiveBoard } = require('../liveboard');

const activeLocks = new Set();

/** ตรวจสอบความพร้อมของรอบ */
async function checkEligibility(interaction) {
  const round = await db.getOrCreateCurrentRound();
  if (!round || round.status !== 'open') return { ok: false, msg: '❌ รอบการจองปิดอยู่ครับ' };
  return { ok: true, round };
}

/** แสดงผลสถานะการจองทั้งหมด (Dashboard สรุปยอด - สำหรับ /mystuff) */
async function renderUserStatus(interaction, discordUserId, round, successMsg = null) {
  const myReservations = await db.getMyReservations(discordUserId, round.id);
  const quota = round.quota || 1;

  const featherPagesCount = new Set(myReservations.filter(r => FEATHER_TYPES.includes(r.item_type)).map(r => r.page_name)).size;
  const albumItemsCount = myReservations.filter(r => !FEATHER_TYPES.includes(r.item_type)).length;

  if (myReservations.length === 0) {
    const content = (successMsg ? `${successMsg}\n\n` : '') + '✅ คุณไม่มีรายการจองค้างอยู่ครับ';
    if (!interaction.deferred && !interaction.replied) return interaction.reply({ content, ephemeral: true });
    return interaction.editReply({ content, components: [] });
  }

  const grouped = {};
  myReservations.forEach(r => { if (!grouped[r.page_name]) grouped[r.page_name] = []; grouped[r.page_name].push(r); });

  const currentList = Object.keys(grouped).map(pageName => {
    const items = grouped[pageName];
    if (items.length >= 4) return `• **หน้า ${pageName}** (ยกหน้า)`;
    return `• **หน้า ${pageName}** (${items.length} ชิ้น)`;
  }).join('\n');

  let rows = [];
  let currentRow = new ActionRowBuilder();
  Object.entries(grouped).forEach(([pageName, items]) => {
    const isFeather = items.some(it => FEATHER_TYPES.includes(it.item_type));
    const btn = new ButtonBuilder()
      .setCustomId(isFeather ? `c_p_${items[0].page_id}` : `c_i_${items[0].item_id}`)
      .setLabel(`❌ หน้า ${pageName}`)
      .setStyle(ButtonStyle.Danger);
    if (currentRow.components.length === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    currentRow.addComponents(btn);
  });

  const cancelAllBtn = new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกทั้งหมด').setStyle(ButtonStyle.Danger);
  if (currentRow.components.length === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
  currentRow.addComponents(cancelAllBtn);
  rows.push(currentRow);

  const finalContent = (successMsg ? `${successMsg}\n\n` : '') +
    `🎒 รายการขนนกของคุณ (${featherPagesCount}/${quota})${albumItemsCount > 0 ? ' (+สมุด)' : ''}:\n${currentList}`;

  if (!interaction.deferred && !interaction.replied) return interaction.reply({ content: finalContent, components: rows.slice(0, 5), ephemeral: true });
  return interaction.editReply({ content: finalContent, components: rows.slice(0, 5) });
}

async function reserveFeatherPage(interaction, pageId) {
  const lockKey = `page_${pageId}`;
  if (activeLocks.has(lockKey)) return interaction.reply({ content: '❌ กำลังดำเนินการ...', ephemeral: true }).catch(() => { });
  activeLocks.add(lockKey);

  try {
    const discordUserId = interaction.user.id;
    const discordUsername = interaction.member?.displayName ?? interaction.user.username;
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, ephemeral: true });
    const { round } = check;

    const myRes = await db.getMyReservations(discordUserId, round.id);
    const quota = round.quota || 1;
    // นับเฉพาะขนนก (Light-Dark, Time-Space) ไม่นับสมุด
    const currentUsage = new Set(myRes.filter(r => FEATHER_TYPES.includes(r.item_type)).map(r => r.page_name)).size;

    if (currentUsage >= quota) return interaction.reply({ content: `❌ โควต้าขนนกของคุณเต็มแล้วครับ (${currentUsage}/${quota})`, ephemeral: true });

    const allItems = await db.getItemsForPage(pageId, round.id);
    const available = allItems.filter(i => FEATHER_TYPES.includes(i.item_type) && !i.reserved_by);

    if (available.length === 0) {
      await updateLiveBoard(interaction.client, round.id);
      return interaction.reply({ content: '❌ หน้านี้ถูกจองแล้วครับ', ephemeral: true });
    }

    await db.addMultipleReservations(round.id, available.map(i => i.id), discordUserId, discordUsername);
    await updateLiveBoard(interaction.client, round.id);

    // Success - Minimal Response
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`c_p_${pageId}`).setLabel(`❌ ยกเลิกหน้า ${allItems[0].page_name}`).setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ content: `✅ จองสำเร็จ! **หน้า ${allItems[0].page_name}**`, components: [row], ephemeral: true });

  } catch (err) {
    await updateLiveBoard(interaction.client, 0); // Refresh if error
    if (!interaction.replied) interaction.reply({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true }).catch(() => { });
  } finally {
    activeLocks.delete(lockKey);
  }
}

async function reserveBookItem(interaction, itemId) {
  const lockKey = `item_${itemId}`;
  if (activeLocks.has(lockKey)) return interaction.reply({ content: '❌ กำลังดำเนินการ...', ephemeral: true }).catch(() => { });
  activeLocks.add(lockKey);

  try {
    const discordUserId = interaction.user.id;
    const discordUsername = interaction.member?.displayName ?? interaction.user.username;
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, ephemeral: true });
    const { round } = check;

    const myRes = await db.getMyReservations(discordUserId, round.id);
    // เช็คว่าเคยจองสมุด (Album) ไปหรือยัง (ขนนกไม่นับรวมโควต้าสมุด)
    const hasAlbum = myRes.some(r => !FEATHER_TYPES.includes(r.item_type));
    if (hasAlbum) return interaction.reply({ content: '❌ คุณจองสมุดไปแล้วครับ (จำกัด 1 เล่มต่อคน)', ephemeral: true });

    const ok = await db.isWhitelisted(discordUserId);
    if (!ok) return interaction.reply({ content: '❌ เฉพาะ Whitelist เท่านั้นครับ', ephemeral: true });

    const item = await db.getItemById(itemId);
    if (!item) return interaction.reply({ content: '❌ ไม่พบสินค้า', ephemeral: true });

    if (await db.isItemReserved(round.id, itemId)) {
      await updateLiveBoard(interaction.client, round.id);
      return interaction.reply({ content: '❌ ถูกจองไปแล้วครับ', ephemeral: true });
    }

    await db.addReservation(round.id, itemId, discordUserId, discordUsername);
    await updateLiveBoard(interaction.client, round.id);

    // Success - Minimal Response
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`c_i_${itemId}`).setLabel(`❌ ยกเลิก Album #${item.position}`).setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ content: `✅ จองสำเร็จ! **Album #${item.position}** (หน้า ${item.page_name})`, components: [row], ephemeral: true });

  } catch (err) {
    if (!interaction.replied) interaction.reply({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true }).catch(() => { });
  } finally {
    activeLocks.delete(lockKey);
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('available').setDescription('ตรวจสอบสินค้าที่ว่างและทำการจอง'),
  async execute(interaction) {
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, ephemeral: true });
    const { round } = check;
    const allItems = await db.getAvailableItems(round.id);
    if (allItems.length === 0) return interaction.reply({ content: '📭 ไม่มีสินค้าว่างครับ', ephemeral: true });
    const embed = new EmbedBuilder().setTitle('📦 รายการที่ว่าง').setColor(0x00FF00).setFooter({ text: `Round: ${round.name}` });
    const grouped = {};
    allItems.forEach(i => { if (!grouped[i.page_name]) grouped[i.page_name] = []; grouped[i.page_name].push(i); });
    Object.entries(grouped).forEach(([pageName, items]) => {
      embed.addFields({ name: `📄 หน้า ${pageName}`, value: items.map(i => `• #${i.position}`).join('\n'), inline: true });
    });
    const rows = [];
    let currentRow = new ActionRowBuilder();
    Object.entries(grouped).forEach(([pageName, items]) => {
      const isFeather = items.some(i => FEATHER_TYPES.includes(i.item_type));
      const btn = new ButtonBuilder()
        .setCustomId(isFeather ? `reserve_p_${items[0].page_id}` : `reserve_i_${items[0].id}`)
        .setLabel(`จองหน้า ${pageName}${isFeather ? '' : ' (Album)'}`)
        .setStyle(isFeather ? ButtonStyle.Primary : ButtonStyle.Success);

      if (isFeather) {
        const type = items[0].item_type.toLowerCase();
        if (type === 'light-dark') btn.setEmoji(ICONS.LIGHT_DARK);
        else if (type === 'time-space') btn.setEmoji(ICONS.TIME_SPACE);
      } else {
        btn.setEmoji(ICONS.ALBUM);
      }

      if (currentRow.components.length === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
      currentRow.addComponents(btn);
    });
    rows.push(currentRow);
    await interaction.reply({ embeds: [embed], components: rows.slice(0, 5), ephemeral: true });
  },
  async handleButton(interaction) {
    const id = interaction.customId;
    const { LB_FEATHER_PREFIX, LB_BOOK_PREFIX } = require('../liveboard');
    if (id.startsWith('reserve_p_') || id.startsWith(LB_FEATHER_PREFIX)) {
      const prefix = id.startsWith('reserve_p_') ? 'reserve_p_' : LB_FEATHER_PREFIX;
      return await reserveFeatherPage(interaction, parseInt(id.slice(prefix.length)));
    }
    if (id.startsWith('reserve_i_') || id.startsWith(LB_BOOK_PREFIX)) {
      const prefix = id.startsWith('reserve_i_') ? 'reserve_i_' : LB_BOOK_PREFIX;
      return await reserveBookItem(interaction, parseInt(id.slice(prefix.length)));
    }
  },
  async handleSelect(interaction) {
    if (interaction.customId === 'lb_more_items') {
      const [type, id] = interaction.values[0].split(':');
      if (type === 'feather') return await reserveFeatherPage(interaction, parseInt(id));
      if (type === 'book') return await reserveBookItem(interaction, parseInt(id));
    }
    if (interaction.customId.startsWith('lb_album_menu_')) return await reserveBookItem(interaction, parseInt(interaction.values[0]));
    if (interaction.customId.startsWith('lb_ld_menu_') || interaction.customId.startsWith('lb_ts_menu_')) return await reserveFeatherPage(interaction, parseInt(interaction.values[0]));
  },
  renderUserStatus,
};
