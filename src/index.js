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
