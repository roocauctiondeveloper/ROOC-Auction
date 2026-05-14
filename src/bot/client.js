const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const availableCmd = require('./commands/available');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  rest: {
    timeout: 60000, // เพิ่มเป็น 60 วินาที
    retries: 5      // ลองใหม่ 5 ครั้ง
  }
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

client.once('clientReady', (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});


client.on('interactionCreate', async interaction => {
  // Handle Unreserve Button (จากข้อความจองสำเร็จ)
  if (interaction.isButton() && interaction.customId === 'unreserve_me') {
    try {
      const db = require('../db/queries');
      const { updateLiveBoard } = require('./liveboard');

      const currentRound = await db.getCurrentRound();
      
      if (!currentRound || currentRound.status !== 'open') {
        return interaction.reply({ content: '❌ ไม่สามารถยกเลิกได้ เนื่องจากรอบปิดไปแล้วครับ', ephemeral: true });
      }

      // Acknowledge ทันที (ปุ่มจะหยุดหมุน) แต่ไม่ขึ้น "Thinking..."
      await interaction.deferUpdate();

      await db.deleteAllUserReservationsInRound(currentRound.id, interaction.user.id);
      
      // อัปเดตบอร์ด (งานหนัก)
      await updateLiveBoard(interaction.client, currentRound.id);

      const ldQuota = currentRound.quota_ld || 1;
      const tsQuota = currentRound.quota_ts || 1;
      const ldLeft = ldQuota >= 999 ? '∞' : ldQuota;
      const tsLeft = tsQuota >= 999 ? '∞' : tsQuota;
      const quotaStr = `\n📊 **โควต้าที่เหลือ**: 🤍 LD (${ldLeft}), ❤️ TS (${tsLeft})`;

      // แสดงแค่ข้อความสั้นๆ ว่าสำเร็จ
      return interaction.editReply({ content: `✅ ยกเลิกรายการทั้งหมดของคุณเรียบร้อยแล้วครับ${quotaStr}`, components: [] });
    } catch (err) {
      console.error('[client] unreserve button error:', err);
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการยกเลิก กรุณาลองใหม่', ephemeral: true });
      }
      return interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการยกเลิก กรุณาลองใหม่', ephemeral: true });
    }
  }

  // Handle Individual and Bulk Cancel Buttons (from /mystuff or success message)
  if (interaction.isButton() && (interaction.customId.startsWith('c_p_') || interaction.customId.startsWith('c_i_') || interaction.customId.startsWith('c_b_'))) {
    try {
      const db = require('../db/queries');
      const { updateLiveBoard } = require('./liveboard');
      const currentRound = await db.getCurrentRound();

      if (!currentRound || currentRound.status !== 'open') {
        return interaction.reply({ content: '❌ ไม่สามารถยกเลิกได้ เนื่องจากรอบปิดไปแล้วครับ', ephemeral: true });
      }

      await interaction.deferUpdate();

      if (interaction.customId.startsWith('c_p_')) {
        const pageId = interaction.customId.replace('c_p_', '');
        console.log(`[Cancel] User ${interaction.user.id} requested to cancel Page ${pageId}`);
        await db.deletePageReservationsForUser(currentRound.id, pageId, interaction.user.id);
      } else if (interaction.customId.startsWith('c_b_')) {
        const itemIds = interaction.customId.replace('c_b_', '').split('_');
        console.log(`[Cancel] User ${interaction.user.id} requested to cancel bulk items:`, itemIds);
        for (const id of itemIds) {
          if (id) await db.deleteSingleReservation(currentRound.id, id, interaction.user.id);
        }
      } else {
        const itemId = interaction.customId.replace('c_i_', '');
        console.log(`[Cancel] User ${interaction.user.id} requested to cancel Item ID: ${itemId}`);
        await db.deleteSingleReservation(currentRound.id, itemId, interaction.user.id);
      }

      await updateLiveBoard(interaction.client, currentRound.id);

      const updatedRes = await db.getMyReservations(interaction.user.id, currentRound.id);
      const ldUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'light-dark').length;
      const tsUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'time-space').length;
      const ldQuota = currentRound.quota_ld || 1;
      const tsQuota = currentRound.quota_ts || 1;
      const ldLeft = ldQuota >= 999 ? '∞' : Math.max(0, ldQuota - ldUsage);
      const tsLeft = tsQuota >= 999 ? '∞' : Math.max(0, tsQuota - tsUsage);
      const quotaStr = `\n📊 **โควต้าที่เหลือ**: 🤍 LD (${ldLeft}), ❤️ TS (${tsLeft})`;

      // แสดงแค่ข้อความสั้นๆ ว่าสำเร็จ
      return interaction.editReply({ content: `✅ ยกเลิกรายการเรียบร้อยแล้วครับ${quotaStr}`, components: [] });
    } catch (err) {
      console.error('[client] individual cancel error:', err);
      return interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการยกเลิก', ephemeral: true });
    }
  }

  // Handle Buttons จาก /available
  if (interaction.isButton()) {
    const id = interaction.customId;
    const { LB_FEATHER_PREFIX, LB_BOOK_PREFIX } = require('./liveboard');

    if (
      id.startsWith(availableCmd.BTN_FEATHER_PREFIX) || 
      id.startsWith(availableCmd.BTN_BOOK_PREFIX) ||
      id.startsWith(LB_FEATHER_PREFIX) ||
      id.startsWith(LB_BOOK_PREFIX)
    ) {
      try {
        await availableCmd.handleButton(interaction);
      } catch (error) {
        console.error('[available button] error:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
        }
      }
    }
    return;
  }

  // Handle Select Menu fallback จาก /available (กรณี items > 25)
  if (interaction.isStringSelectMenu()) {
    try {
      await availableCmd.handleSelect(interaction);
    } catch (error) {
      console.error('[available select] error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

module.exports = client;
