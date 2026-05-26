const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../db/queries');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('ส่งรายชื่อเพื่อนในปาร์ตี้เข้าวงล้อสุ่ม (สูงสุด 2 คน โดยเว้นวรรค)')
    .addStringOption(option => 
      option.setName('names')
        .setDescription('ระบุชื่อเพื่อน (เช่น @ชื่อ1 @ชื่อ2 หรือ ชื่อ1 ชื่อ2) สูงสุด 2 คน')
        .setRequired(true)),

  async execute(interaction) {
    const callerId = interaction.user.id;
    const inputNames = interaction.options.getString('names');

    try {
      // 1. Check if caller is in a party
      const callerParty = await db.getPartyByDiscordUserId(callerId);
      if (!callerParty) {
        return interaction.reply({ 
          content: '❌ คุณไม่ได้อยู่ในปาร์ตี้ใดๆ จึงไม่สามารถใช้คำสั่งนี้ได้', 
          flags: [MessageFlags.Ephemeral] 
        });
      }

      // Fetch all whitelist members to match names/IDs
      const allWhitelist = await db.getAllWhitelist();

      // Extract user IDs from mentions
      const mentions = [...inputNames.matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
      let selectedMembers = [];

      if (mentions.length > 0) {
        // Match by discord_user_id
        for (const discordId of mentions) {
          const member = allWhitelist.find(w => w.discord_user_id === discordId);
          if (member) {
            selectedMembers.push(member);
          } else {
            return interaction.reply({
              content: `❌ ผู้ใช้ <@${discordId}> ไม่ได้อยู่ใน Whitelist`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        }
      } else {
        // Split by space and match by username
        const names = inputNames.split(/\s+/).filter(n => n.trim().length > 0);
        for (const name of names) {
          const cleanName = name.replace(/^@/, '').toLowerCase();
          const member = allWhitelist.find(w => w.discord_username.toLowerCase() === cleanName);
          if (member) {
            selectedMembers.push(member);
          } else {
            return interaction.reply({
              content: `❌ ไม่พบผู้ใช้ชื่อ **${name}** ใน Whitelist`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        }
      }

      if (selectedMembers.length === 0) {
        return interaction.reply({
          content: '❌ กรุณาระบุชื่อผู้ใช้หรือ Tag สมาชิกที่ต้องการส่งชื่อ',
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (selectedMembers.length > 2) {
        return interaction.reply({
          content: '❌ สามารถส่งชื่อได้สูงสุด 2 คนเท่านั้นครับ',
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if selected members are in caller's party
      const partyMembers = await db.getPartyMembers();
      for (const member of selectedMembers) {
        const isInParty = partyMembers.some(pm => pm.party_id === callerParty.id && pm.whitelist_id === member.id);
        if (!isInParty) {
          return interaction.reply({
            content: `❌ **${member.discord_username}** ไม่ได้อยู่ในปาร์ตี้เดียวกับคุณ (${callerParty.name})`,
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

      // 4. Record the submission using whitelist IDs
      const nom1 = selectedMembers[0].id.toString();
      const nom2 = selectedMembers[1] ? selectedMembers[1].id.toString() : null;

      await db.addWheelEntry(callerId, nom1, nom2);

      const nomNames = selectedMembers.map(m => m.discord_user_id ? `<@${m.discord_user_id}>` : `**${m.discord_username}**`).join(' และ ');
      
      // Public reply so everyone can see the names submitted
      return interaction.reply({ 
        content: `✅ <@${callerId}> ได้ส่งชื่อ ${nomNames} เข้าวงล้อสำเร็จ!\n(ส่งจาก **${callerParty.name}**)`, 
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({ 
        content: '❌ เกิดข้อผิดพลาดในการส่งรายชื่อ โปรดลองใหม่', 
        flags: [MessageFlags.Ephemeral] 
      });
    }
  }
};
