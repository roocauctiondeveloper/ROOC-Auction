const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const availableCmd = require('./commands/available');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
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

client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  // Handle Buttons จาก /available
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith(availableCmd.BTN_FEATHER_PREFIX) || id.startsWith(availableCmd.BTN_BOOK_PREFIX)) {
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
