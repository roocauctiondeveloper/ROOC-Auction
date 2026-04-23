// โหลด .env.local ก่อนสุดถ้ามี (local dev), ไม่งั้นใช้ .env (production)
const fs = require('fs');
const path = require('path');
const localEnv = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv });
  console.log('📁 Loaded .env.local');
} else {
  require('dotenv').config();
}

const config = require('./config');
const client = require('./bot/client');
const app = require('./web/app');

// Validate configuration
try {
  config.validateConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

// Start Web Server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`✅ Web Dashboard running on port ${PORT}`);
  
  // Start Discord Bot in background after web server is up
  client.login(config.discordToken).then(() => {
    console.log('✅ Discord Bot is online');
  }).catch(err => {
    console.error('❌ Failed to login to Discord:', err.message);
  });
});
