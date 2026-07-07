const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db/queries');
const { getInteractionLanguage } = require('../i18n');

const jobChoices = [
  { name: 'Lord Knight (ลอร์ดไนท์)', value: 'Lord Knight' },
  { name: 'Paladin (พาราดิน)', value: 'Paladin' },
  { name: 'High Priest (ไฮพรีส)', value: 'High Priest' },
  { name: 'Champion (แชมเปี้ยน)', value: 'Champion' },
  { name: 'High Wizard (ไฮวิซาร์ด)', value: 'High Wizard' },
  { name: 'Scholar (สกอลาร์)', value: 'Scholar' },
  { name: 'Sniper (สไนเปอร์)', value: 'Sniper' },
  { name: 'Clown (คลาวน์)', value: 'Clown' },
  { name: 'Gypsy (ยิปซี)', value: 'Gypsy' },
  { name: 'Assassin Cross (แอสซาซินครอส)', value: 'Assassin Cross' },
  { name: 'Stalker (สตอล์กเกอร์)', value: 'Stalker' },
  { name: 'Whitesmith (ไวท์สมิธ)', value: 'Whitesmith' },
  { name: 'Creator (ครีเอเตอร์)', value: 'Creator' },
  { name: 'Gunslinger (กันสลิงเกอร์)', value: 'Gunslinger' },
  { name: 'Summoner (ซัมมอนเนอร์)', value: 'Summoner' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('ระบุอาชีพในเกมของคุณ (Set your in-game job)')
    .addStringOption(option =>
      option
        .setName('class')
        .setDescription('เลือกอาชีพของคุณ (Choose your job)')
        .setRequired(true)
        .addChoices(...jobChoices)
    ),

  async execute(interaction) {
    const job = interaction.options.getString('class');
    const userId = interaction.user.id;
    const username = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;

    try {
      await db.saveUserJob(userId, username, job);
      const language = await getInteractionLanguage(interaction);
      
      let replyMsg = '';
      if (language === 'th') {
        replyMsg = `✅ ตั้งค่าอาชีพของคุณเป็น **${job}** เรียบร้อยแล้ว!`;
      } else {
        replyMsg = `✅ Your job has been successfully set to **${job}**!`;
      }

      return interaction.reply({
        content: replyMsg,
        ephemeral: true
      });
    } catch (err) {
      console.error('Error saving user job:', err);
      const language = await getInteractionLanguage(interaction);
      return interaction.reply({
        content: language === 'th' ? '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลอาชีพ' : '❌ Failed to save your job information.',
        ephemeral: true
      });
    }
  }
};
