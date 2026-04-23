// env โหลดที่ src/index.js แล้ว (entry point)

function validateConfig() {
  const requiredKeys = [
    'DISCORD_TOKEN', 
    'DISCORD_CLIENT_ID', 
    'DISCORD_CLIENT_SECRET',
    'DISCORD_CALLBACK_URL',
    'DISCORD_GUILD_ID', 
    'PORT', 
    'SESSION_SECRET'
  ];
  const missing = [];
  
  for (const key of requiredKeys) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  validateConfig,
  get discordToken() { return process.env.DISCORD_TOKEN; },
  get discordClientId() { return process.env.DISCORD_CLIENT_ID; },
  get discordClientSecret() { return process.env.DISCORD_CLIENT_SECRET; },
  get discordCallbackUrl() { return process.env.DISCORD_CALLBACK_URL; },
  get discordGuildId() { return process.env.DISCORD_GUILD_ID; },
  get port() { return process.env.PORT || 3000; },
  get sessionSecret() { return process.env.SESSION_SECRET; },
  get databaseType() { return process.env.DATABASE_TYPE || 'sqlite'; }, // 'sqlite' or 'postgres'
  get databaseUrl() { return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL; },
  get discordAdminId() { return process.env.DISCORD_ADMIN_ID; } // ID ของคุณที่เป็นเจ้าของบอท
};

