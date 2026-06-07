const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../db/queries');
const { getInteractionLanguage, translate } = require('../i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('Submit party members to the lottery wheel, up to 2 names separated by spaces')
    .addStringOption(option => 
      option.setName('names')
        .setDescription('Enter up to 2 members, such as @user1 @user2 or name1 name2')
        .setRequired(true)),

  async execute(interaction) {
    const language = await getInteractionLanguage(interaction);
    const callerId = interaction.user.id;
    const inputNames = interaction.options.getString('names');

    try {
      // 1. Check if caller is in a party
      const callerParty = await db.getPartyByDiscordUserId(callerId);
      if (!callerParty) {
        return interaction.reply({ 
          content: translate(language, 'notInParty'),
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
              content: translate(language, 'userNotWhitelist', { discordId }),
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
              content: translate(language, 'nameNotWhitelist', { name }),
              flags: [MessageFlags.Ephemeral]
            });
          }
        }
      }

      if (selectedMembers.length === 0) {
        return interaction.reply({
          content: translate(language, 'enterNames'),
          flags: [MessageFlags.Ephemeral]
        });
      }

      if (selectedMembers.length > 2) {
        return interaction.reply({
          content: translate(language, 'maxTwo'),
          flags: [MessageFlags.Ephemeral]
        });
      }

      // Check if selected members are in caller's party
      const partyMembers = await db.getPartyMembers();
      for (const member of selectedMembers) {
        const isInParty = partyMembers.some(pm => pm.party_id === callerParty.id && pm.whitelist_id === member.id);
        if (!isInParty) {
          return interaction.reply({
            content: translate(language, 'notSameParty', { username: member.discord_username, partyName: callerParty.name }),
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

      // 4. Record the submission using whitelist IDs
      const nom1 = selectedMembers[0].id.toString();
      const nom2 = selectedMembers[1] ? selectedMembers[1].id.toString() : null;

      // Clear all previous submissions from any member in this party
      await db.deleteWheelEntriesByParty(callerParty.id);

      await db.addWheelEntry(callerId, nom1, nom2);

      const nomNames = selectedMembers.map(m => m.discord_user_id ? `<@${m.discord_user_id}>` : `**${m.discord_username}**`).join(' and ');
      
      // Public reply so everyone can see the names submitted
      return interaction.reply({ 
        content: `✅ <@${callerId}> submitted ${nomNames} to the lottery wheel.\n(Submitted from **${callerParty.name}**)`,
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({ 
        content: translate(language, 'partyFailed'),
        flags: [MessageFlags.Ephemeral] 
      });
    }
  }
};
