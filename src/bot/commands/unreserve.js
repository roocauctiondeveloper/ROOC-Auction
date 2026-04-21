const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/queries');
const { updateLiveBoard } = require('../liveboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unreserve')
    .setDescription('ยกเลิกการจองทั้งหมดของคุณในรอบนี้'),

  async execute(interaction) {
    const discordUserId = interaction.user.id;
    const discordUsername = interaction.member?.displayName ?? interaction.user.username;

    try {
      // 1. ตรวจสอบรอบปัจจุบัน
      const currentRound = await db.getCurrentRound();
      if (!currentRound || currentRound.status !== 'open') {
        return interaction.reply({ content: '❌ ขณะนี้ไม่ได้เปิดรับจอง หรือปิดรอบไปแล้ว ไม่สามารถยกเลิกได้ครับ', ephemeral: true });
      }

      // 2. เช็คว่าเขามีจองอะไรไว้ไหม
      const myReservations = await db.getMyReservations(discordUserId, currentRound.id);
      if (myReservations.length === 0) {
        return interaction.reply({ content: '❓ คุณยังไม่มีรายการจองในรอบนี้ครับ', ephemeral: true });
      }

      // 3. ทำการลบ
      await db.deleteAllUserReservationsInRound(currentRound.id, discordUserId);

      // 4. Update Live Board
      await updateLiveBoard(interaction.client, currentRound.id);

      return interaction.reply({
        content: `✅ **${discordUsername}** ยกเลิกการจองทั้งหมดในรอบนี้เรียบร้อยแล้วครับ\n💡 ตอนนี้คุณสามารถเลือกจองรายการใหม่ได้แล้ว!`,
        ephemeral: true
      });

    } catch (err) {
      console.error('[unreserve] error:', err);
      return interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการยกเลิกการจอง', ephemeral: true });
    }
  },
};
