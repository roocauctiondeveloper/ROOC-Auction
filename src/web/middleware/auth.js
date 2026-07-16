const botClient = require('../../bot/client');
const config = require('../../config');

module.exports = {
  ensureAuthenticated: function (req, res, next) {
    if (req.isAuthenticated()) {
      if (req.user && req.user.isAdmin) {
        return next();
      }
      req.session.error_msg = 'ขออภัย เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าหลังบ้านได้';
      return res.redirect('/login');
    }
    req.session.error_msg = 'กรุณาเข้าสู่ระบบก่อนเข้าใช้งาน';
    res.redirect('/login');
  },

  ensureMemberAuthenticated: async function (req, res, next) {
    if (!req.isAuthenticated()) {
      req.session.error_msg = 'กรุณาเข้าสู่ระบบด้วย Discord ก่อนใช้งานระบบโอนสิทธิ์';
      return res.redirect('/login');
    }

    // Bypass check if Super Admin or already marked as Admin
    if (req.user && req.user.isAdmin) {
      return next();
    }

    // Bypass check for local development / testing environments
    if (process.env.BYPASS_GUILD_CHECK === 'true') {
      console.warn('⚠️ Bypassing Discord guild membership check for testing.');
      return next();
    }

    const guildId = config.discordGuildId;
    if (!botClient.isReady()) {
      console.warn('⚠️ Discord bot is not ready. Skipping guild membership check for safety.');
      return next();
    }

    if (!guildId) {
      console.warn('⚠️ DISCORD_GUILD_ID is not configured in environment variables.');
      return next();
    }

    try {
      const guild = await botClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(req.user.discord_user_id);
      if (member) {
        return next();
      }
    } catch (err) {
      console.error(`❌ Guild membership check failed for user ID ${req.user.discord_user_id}:`, err.message);
      req.session.error_msg = 'ขออภัย คุณต้องเป็นสมาชิกของเซิร์ฟเวอร์ Discord หลักของเราก่อนเพื่อใช้งานระบบโอนสิทธิ์';
      return res.redirect('/login');
    }
  }
};

