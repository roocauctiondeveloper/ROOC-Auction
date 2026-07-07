const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv });
  console.log('📁 Loaded .env.local for deploying commands');
} else {
  require('dotenv').config();
}
const { REST, Routes } = require('discord.js');
const config = require('../config');

// 1. ตรวจสอบ Config ก่อนเริ่มทำงาน
if (!config.discordToken || !config.discordClientId || !config.discordGuildId) {
  console.error('❌ Missing Discord environment variables in config/env');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 2. โหลดคำสั่งพร้อมตรวจสอบโครงสร้าง
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`⚠️  [WARNING] The command at ${filePath} is missing "data" or "execute". Skipping.`);
  }
}

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
  try {
    console.log(`⏳ Started refreshing ${commands.length} application (/) commands...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
      { body: commands },
    );

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('❌ Error during command deployment:');
    console.error(error);
  }
})();

