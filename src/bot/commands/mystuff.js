const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../db/queries');
const { ICONS, ITEM_TYPES } = require('../../utils/constants');
const { resolveEmoji } = require('../utils/emoji');

/** จัดการการแสดงผลประเภทสินค้าพร้อมไอคอน */
const getDisplay = (t, guild = null) => {
  const entry = ITEM_TYPES[t];
  if (!entry) return t;
  const emoji = resolveEmoji(entry.emoji, guild, '❓');
  return `${emoji} ${entry.label}`;
};


async function renderMyStuff(interaction, isEdit = false, successMsg = null) {
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member
    ? interaction.member.displayName
    : interaction.user.username;

  const currentRound = await db.getCurrentRound();

  if (!currentRound) {
    const msg = '📭 ยังไม่มีรอบการจองในระบบ';
    if (isEdit) return interaction.editReply({ content: msg, embeds: [], components: [] });
    return interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
  }

  const myReservations = await db.getMyReservations(discordUserId, currentRound.id);

  if (myReservations.length === 0) {
    const msg = successMsg ? `${successMsg}\n\n📭 **${discordUsername}** ไม่มีรายการจองเหลืออยู่แล้ว` : `📭 **${discordUsername}** ยังไม่มีการจองในรอบนี้`;
    if (isEdit) return interaction.editReply({ content: msg, embeds: [], components: [] });
    return interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎒 รายการของ ${discordUsername}`)
    .setColor(0x5865F2)
      .setFooter({ text: `Round: ${currentRound.name}` })
      .setTimestamp();

    // จัด group ตาม page
    // จัด group ตาม page สำหรับแสดงผลข้อความ
    const groupedByPage = new Map();
    // จัด group ตามเวลาที่จอง (reserved_at) และประเภท สำหรับสร้างปุ่มยกเลิก
    const groupedByTime = new Map();

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { FEATHER_TYPES } = require('../../utils/constants');

    for (const r of myReservations) {
      // Group by page
      if (!groupedByPage.has(r.page_name)) groupedByPage.set(r.page_name, []);
      groupedByPage.get(r.page_name).push(r);

      // Group by time & type
      if (FEATHER_TYPES.includes(r.item_type)) {
        const timeKey = `${r.reserved_at}_${r.item_type}`;
        if (!groupedByTime.has(timeKey)) groupedByTime.set(timeKey, { type: r.item_type, items: [] });
        groupedByTime.get(timeKey).items.push(r);
      }
    }

    const rows = [];
    let currentRow = new ActionRowBuilder();

    // 1. สร้างข้อความใน Embed โดยแยกตามหน้า
    for (const [pageName, items] of groupedByPage) {
      const byType = {};
      items.forEach(i => {
         if (!byType[i.item_type]) byType[i.item_type] = [];
         byType[i.item_type].push(i.position);
      });

      const lines = Object.keys(byType).map(type => {
         const posList = byType[type].sort((a,b) => a-b);
         return `${getDisplay(type, interaction.guild)} — ตำแหน่ง: [${posList.join(', ')}]`;
      });

      embed.addFields({ name: `📄 หน้า ${pageName} (รวม ${items.length} ชิ้น)`, value: lines.join('\n'), inline: false });
    }

    // 2. สร้างปุ่มยกเลิก โดยจัดกลุ่มตามการกดจอง (reserved_at)
    for (const group of groupedByTime.values()) {
      const type = group.type;
      const items = group.items;
      
      // จัดกลุ่มตามหน้าอีกที เพื่อแสดง label P.X [..] | P.Y [..]
      const pages = {};
      items.forEach(i => {
        if (!pages[i.page_name]) pages[i.page_name] = [];
        pages[i.page_name].push(i.position);
      });

      const detailList = Object.entries(pages).map(([pageNum, posList]) => {
        posList.sort((a, b) => a - b);
        return `P.${pageNum} [${posList.join(', ')}]`;
      }).join(' | ');

      const itemIds = items.map(i => i.item_id).join('_');
      const isLD = type.toLowerCase() === 'light-dark' || type.toLowerCase() === 'ขนนกดำ';
      const typeEmoji = isLD ? '🤍' : '❤️';
      
      // Truncate label if it's too long (Discord limit is 80 chars for button label)
      let labelStr = `❌ ${typeEmoji} ${detailList}`;
      if (labelStr.length > 70) labelStr = labelStr.substring(0, 67) + '...';
      labelStr += ` (x${items.length})`;

      const btn = new ButtonBuilder()
        .setCustomId(`c_b_${itemIds}`)
        .setLabel(labelStr)
        .setStyle(ButtonStyle.Danger);

      if (currentRow.components.length === 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(btn);
    }

    // เพิ่มปุ่มยกเลิกทั้งหมดไว้ท้ายสุด (ถ้ามีขนนกให้ยกเลิก)
    const hasFeather = myReservations.some(r => FEATHER_TYPES.includes(r.item_type));
    if (hasFeather) {
      const cancelAllBtn = new ButtonBuilder()
        .setCustomId('unreserve_me')
        .setLabel('❌ ยกเลิกทั้งหมด')
        .setStyle(ButtonStyle.Danger);

      if (currentRow.components.length === 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(cancelAllBtn);
    }
    
    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    const ldUsage = myReservations.filter(r => r.item_type.toLowerCase() === 'light-dark').length;
    const tsUsage = myReservations.filter(r => r.item_type.toLowerCase() === 'time-space').length;
    const ldQuota = currentRound.quota_ld || 1;
    const tsQuota = currentRound.quota_ts || 1;
    const ldLeft = ldQuota >= 999 ? '∞' : Math.max(0, ldQuota - ldUsage);
    const tsLeft = tsQuota >= 999 ? '∞' : Math.max(0, tsQuota - tsUsage);
    const quotaStr = `📊 **โควต้าที่เหลือ**: 🤍 LD (${ldLeft}), ❤️ TS (${tsLeft})`;

    const content = successMsg ? `✅ ${successMsg}\n\nคุณได้ทำการจองไปแล้วทั้งหมด **${myReservations.length}** รายการ\n${quotaStr}` : `คุณได้ทำการจองไปแล้วทั้งหมด **${myReservations.length}** รายการ\n${quotaStr}`;
    embed.setDescription(content);

    if (isEdit) {
      return interaction.editReply({ content: '', embeds: [embed], components: rows.slice(0, 5) });
    } else {
      return interaction.reply({ embeds: [embed], components: rows.slice(0, 5), flags: [MessageFlags.Ephemeral] });
    }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystuff')
    .setDescription('ดูรายการที่คุณจองไว้ในรอบปัจจุบัน'),

  async execute(interaction) {
    return renderMyStuff(interaction, false, null);
  },
  
  renderMyStuff
};
