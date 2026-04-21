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
      .setFooter({ text: `รอบ: ${currentRound.name} • /unreserve เพื่อยกเลิกรายการ` })
      .setTimestamp();

    // จัด group ตาม page
    const grouped = new Map();
    for (const r of myReservations) {
      if (!grouped.has(r.page_name)) grouped.set(r.page_name, []);
      grouped.get(r.page_name).push(r);
    }

    for (const [pageName, items] of grouped) {
      const lines = items.map(i => `ชิ้นที่ ${i.position} — ${getDisplay(i.item_type, interaction.guild)}`);
      embed.addFields({ name: `📄 หน้า ${pageName}`, value: lines.join('\n'), inline: false });
    }

    embed.setDescription(`คุณได้ทำการจองไปแล้วทั้งหมด **${myReservations.length}** รายการ`);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
