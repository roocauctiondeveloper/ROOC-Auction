const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { normalizeLanguage, setUserLanguage, translate } = require('../i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lang')
    .setDescription('Set your personal bot reply language')
    .addStringOption(option =>
      option
        .setName('set')
        .setDescription('Choose your language')
        .setRequired(true)
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'ไทย (Thai)', value: 'th' },
          { name: 'Bahasa Indonesia', value: 'id' },
          { name: 'Tagalog', value: 'tl' },
          { name: '中文 (Chinese)', value: 'zh' }
        )),

  async execute(interaction) {
    const selected = interaction.options.getString('set');
    const language = normalizeLanguage(selected);

    if (language !== selected) {
      return interaction.reply({
        content: translate(language, 'languageInvalid'),
        ephemeral: true,
      });
    }

    await setUserLanguage(interaction.user.id, language);
    return interaction.reply({
      content: translate(language, 'languageSet'),
      ephemeral: true,
    });
  },
};
