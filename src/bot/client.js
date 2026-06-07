const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const availableCmd = require('./commands/available');
const { getInteractionLanguage, translate } = require('./i18n');

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
  // ─── Whitelist & Reservations Auto-Sync Display Name ──────────────────────────────────
  try {
    const db = require('../db/queries');
    const rawDb = require('../db/database');
    const userId = interaction.user.id;
    const currentDisplayName = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;

    if (currentDisplayName) {
      // 1. Sync Whitelist display name
      rawDb.all('SELECT id, discord_username FROM whitelist WHERE discord_user_id = ?', [userId]).then(rows => {
        if (rows && rows.length > 0) {
          const whitelistMember = rows[0];
          if (currentDisplayName !== whitelistMember.discord_username) {
            console.log(`[Sync-Bot] Auto-updating whitelist nickname for ID ${userId}: "${whitelistMember.discord_username}" -> "${currentDisplayName}"`);
            db.updateWhitelistUsername(whitelistMember.id, currentDisplayName).catch(err => {
              console.error('[Sync-Bot] Failed to update whitelist username:', err.message);
            });
          }
        }
      }).catch(err => {
        console.error('[Sync-Bot] Whitelist query failed:', err.message);
      });

      // 2. Sync Reservations display name for active reservations
      db.updateUserReservationsUsername(userId, currentDisplayName).catch(err => {
        console.error('[Sync-Bot] Failed to update user reservations username:', err.message);
      });
    }
  } catch (syncErr) {
    console.error('[Sync-Bot] Sync error:', syncErr.message);
  }

  // Handle the My Stuff button from the live board.
  if (interaction.isButton() && interaction.customId === 'lb_mystuff') {
    try {
      const { renderMyStuff } = require('./commands/mystuff');
      return renderMyStuff(interaction, false, null);
    } catch (err) {
      const language = await getInteractionLanguage(interaction);
      console.error('[client] lb_mystuff error:', err);
      return interaction.reply({ content: translate(language, 'loadBagFailed'), flags: [MessageFlags.Ephemeral] });
    }
  }

  if (interaction.isButton() && interaction.customId === 'unreserve_me') {
    try {
      const language = await getInteractionLanguage(interaction);
      const db = require('../db/queries');
      const { updateLiveBoard } = require('./liveboard');

      const currentRound = await db.getCurrentRound();
      
      if (!currentRound || currentRound.status !== 'open') {
        return interaction.reply({ content: translate(language, 'cancelClosed'), flags: [MessageFlags.Ephemeral] });
      }

      // Acknowledge immediately so the button stops spinning without showing "Thinking..."
      await interaction.deferUpdate();

      await db.deleteAllUserReservationsInRound(currentRound.id, interaction.user.id);
      
      updateLiveBoard(interaction.client, currentRound.id).catch(err => console.error('❌ Board update error:', err));

      if (interaction.message.embeds && interaction.message.embeds.length > 0) {
        const { renderMyStuff } = require('./commands/mystuff');
        return renderMyStuff(interaction, true, translate(language, 'allCanceled'));
      } else {
        const ldQuota = currentRound.quota_ld || 1;
        const tsQuota = currentRound.quota_ts || 1;
        const ldLeft = ldQuota >= 999 ? '∞' : ldQuota;
        const tsLeft = tsQuota >= 999 ? '∞' : tsQuota;
        const quotaStr = translate(language, 'remainingQuota', { ldLeft, tsLeft });

        // Show a short success message.
        return interaction.editReply({ content: translate(language, 'allCanceledReply', { quotaStr }), components: [] });
      }
    } catch (err) {
      const language = await getInteractionLanguage(interaction);
      console.error('[client] unreserve button error:', err);
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: translate(language, 'cancelFailedRetry'), flags: [MessageFlags.Ephemeral] });
      }
      return interaction.reply({ content: translate(language, 'cancelFailedRetry'), flags: [MessageFlags.Ephemeral] });
    }
  }

  // Handle Individual and Bulk Cancel Buttons (from /mystuff or success message)
  if (interaction.isButton() && (interaction.customId.startsWith('c_p_') || interaction.customId.startsWith('c_i_') || interaction.customId.startsWith('c_b_'))) {
    try {
      const language = await getInteractionLanguage(interaction);
      const db = require('../db/queries');
      const { updateLiveBoard } = require('./liveboard');
      const currentRound = await db.getCurrentRound();

      if (!currentRound || currentRound.status !== 'open') {
        return interaction.reply({ content: translate(language, 'cancelClosed'), flags: [MessageFlags.Ephemeral] });
      }

      await interaction.deferUpdate();

      const discordUsername = interaction.member?.displayName ?? interaction.user.username;

      if (interaction.customId.startsWith('c_p_')) {
        const pageId = interaction.customId.replace('c_p_', '');
        console.log(`[Cancel] User ${discordUsername} requested to cancel Page ${pageId}`);
        await db.deletePageReservationsForUser(currentRound.id, pageId, interaction.user.id);
      } else if (interaction.customId.startsWith('c_b_')) {
        const itemIds = interaction.customId.replace('c_b_', '').split('_');
        console.log(`[Cancel] User ${discordUsername} requested to cancel bulk items:`, itemIds);
        for (const id of itemIds) {
          if (id) await db.deleteSingleReservation(currentRound.id, id, interaction.user.id);
        }
      } else {
        const itemId = interaction.customId.replace('c_i_', '');
        console.log(`[Cancel] User ${discordUsername} requested to cancel Item ID: ${itemId}`);
        await db.deleteSingleReservation(currentRound.id, itemId, interaction.user.id);
      }

      updateLiveBoard(interaction.client, currentRound.id).catch(err => console.error('❌ Board update error:', err));

      if (interaction.message.embeds && interaction.message.embeds.length > 0) {
        const { renderMyStuff } = require('./commands/mystuff');
        return renderMyStuff(interaction, true, translate(language, 'oneCanceled'));
      } else {
        const updatedRes = await db.getMyReservations(interaction.user.id, currentRound.id);
        const ldUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'light-dark').length;
        const tsUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'time-space').length;
        const ldQuota = currentRound.quota_ld || 1;
        const tsQuota = currentRound.quota_ts || 1;
        const ldLeft = ldQuota >= 999 ? '∞' : Math.max(0, ldQuota - ldUsage);
        const tsLeft = tsQuota >= 999 ? '∞' : Math.max(0, tsQuota - tsUsage);
        const quotaStr = translate(language, 'remainingQuota', { ldLeft, tsLeft });

        // Show a short success message.
        return interaction.editReply({ content: translate(language, 'oneCanceledReply', { quotaStr }), components: [] });
      }
    } catch (err) {
      const language = await getInteractionLanguage(interaction);
      console.error('[client] individual cancel error:', err);
      return interaction.followUp({ content: translate(language, 'cancelFailed'), flags: [MessageFlags.Ephemeral] });
    }
  }

  // Handle buttons from /available.
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
        const language = await getInteractionLanguage(interaction);
        console.error('[available button] error:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: translate(language, 'tryAgain'), flags: [MessageFlags.Ephemeral] });
        }
      }
    }
    return;
  }

  // Handle select menu fallback from /available when there are more than 25 items.
  if (interaction.isStringSelectMenu()) {
    try {
      await availableCmd.handleSelect(interaction);
    } catch (error) {
      const language = await getInteractionLanguage(interaction);
      console.error('[available select] error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: translate(language, 'tryAgain'), flags: [MessageFlags.Ephemeral] });
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
    const language = await getInteractionLanguage(interaction);
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: translate(language, 'commandError'), flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.reply({ content: translate(language, 'commandError'), flags: [MessageFlags.Ephemeral] });
    }
  }
});

module.exports = client;
