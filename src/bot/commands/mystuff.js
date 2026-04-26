const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystuff')
    .setDescription('ดูรายการที่คุณจองไว้ในรอบปัจจุบัน'),

  async execute(interaction) {
    const discordUserId = interaction.user.id;
    const discordUsername = interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

    const currentRound = await db.getCurrentRound();

    if (!currentRound) {
      return interaction.reply({
        content: '📭 ยังไม่มีรอบการจองในระบบ',
        ephemeral: true,
      });
    }

    const myReservations = await db.getMyReservations(discordUserId, currentRound.id);

    if (myReservations.length === 0) {
      return interaction.reply({
        content: `📭 **${discordUsername}** ยังไม่มีการจองในรอบนี้`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎒 รายการของ ${discordUsername}`)
      .setColor(0x5865F2)
      .setFooter({ text: `Round: ${currentRound.name}` })
      .setTimestamp();

    // จัด group ตาม page
    const grouped = new Map();
    for (const r of myReservations) {
      if (!grouped.has(r.page_name)) grouped.set(r.page_name, []);
      grouped.get(r.page_name).push(r);
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { FEATHER_TYPES } = require('../../utils/constants');
    const rows = [];
    let currentRow = new ActionRowBuilder();

    for (const [pageName, items] of grouped) {
      const lines = items.map(i => `ชิ้นที่ ${i.position} — ${getDisplay(i.item_type, interaction.guild)}`);
      embed.addFields({ name: `📄 หน้า ${pageName}`, value: lines.join('\n'), inline: false });

      // สร้างปุ่มยกเลิกสำหรับหน้านี้
      const isFeather = items.some(it => FEATHER_TYPES.includes(it.item_type));
      const pageId = items[0].page_id;
      const itemId = items[0].item_id;

      const btn = new ButtonBuilder()
        .setStyle(ButtonStyle.Danger);

      if (isFeather) {
        btn.setCustomId(`c_p_${pageId}`).setLabel(`❌ ยกเลิกหน้า ${pageName}`);
      } else {
        btn.setCustomId(`c_i_${itemId}`).setLabel(`❌ ยกเลิก Album #${items[0].position}`);
      }

      if (currentRow.components.length === 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(btn);
    }

    // เพิ่มปุ่มยกเลิกทั้งหมดไว้ท้ายสุด (ถ้ามีปุ่มเดียวไม่ต้องขึ้นแถวใหม่)
    const cancelAllBtn = new ButtonBuilder()
      .setCustomId('unreserve_me')
      .setLabel('❌ ยกเลิกทั้งหมด')
      .setStyle(ButtonStyle.Danger);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(cancelAllBtn);
    rows.push(currentRow);

    embed.setDescription(`คุณได้ทำการจองไปแล้วทั้งหมด **${myReservations.length}** รายการ`);

    return interaction.reply({ embeds: [embed], components: rows.slice(0, 5), ephemeral: true });
  },
};
