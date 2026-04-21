const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const config = require('../config');

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const db = require('../db/queries');
const { version } = require('../../package.json');

const app = express();

// Passport setup
passport.serializeUser((user, done) => {
  done(null, user.discord_user_id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const admin = await db.getAdminByDiscordId(id);
    if (admin) {
      done(null, { ...admin, isAdmin: true });
    } else if (config.discordAdminId && id === config.discordAdminId) {
      // Fallback สำหรับ Super Admin
      done(null, { discord_user_id: id, isAdmin: true, discord_username: 'Super Admin' });
    } else {
      done(null, null);
    }
  } catch (err) {
    done(err);
  }
});

passport.use(new DiscordStrategy({
    clientID: config.discordClientId,
    clientSecret: config.discordClientSecret,
    callbackURL: config.discordCallbackUrl,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // 1. เช็คว่าเป็น Super Admin จาก config หรือไม่
        if (config.discordAdminId && profile.id === config.discordAdminId) {
            return done(null, { 
              discord_user_id: profile.id, 
              discord_username: profile.username || profile.global_name,
              isAdmin: true 
            });
        }

        // 2. เช็คจากฐานข้อมูล
        const admin = await db.getAdminByDiscordId(profile.id);
        if (admin) {
            return done(null, { 
              ...admin, 
              discord_username: profile.username || profile.global_name,
              isAdmin: true 
            });
        } else {
            return done(null, false, { message: 'คุณไม่มีสิทธิ์เข้าใช้งานระบบ' });
        }
    } catch (err) {
        return done(err);
    }
}));


// EJS setup
app.use(expressLayouts);
app.set('layout', 'layout'); // Set default layout
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

// Session
let sessionStore;
if (config.databaseType === 'postgres') {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    conString: config.databaseUrl,
    createTableIfMissing: true
  });
} else {
  const SQLiteStore = require('connect-sqlite3')(session);
  sessionStore = new SQLiteStore({ dir: path.join(__dirname, '../../'), db: 'database.sqlite' });
}

app.use(session({
  store: sessionStore,
  secret: config.sessionSecret || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Provide session user variable to all EJS templates
app.use(async (req, res, next) => {
  res.locals.user = req.user || null;
  
  // ถ้าล็อคอินอยู่ พยายามหาชื่อเล่นใน Server มาแสดง
  if (req.user && req.user.discord_user_id) {
    try {
      const botClient = require('../bot/client');
      const guildId = config.discordGuildId;
      
      if (botClient.isReady() && guildId) {
        const guild = await botClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(req.user.discord_user_id);
        
        if (member) {
          // ใช้ชื่อเล่นในเซิร์ฟ ถ้าไม่มีใช้ displayName ถ้าไม่มีใช้ username เดิม
          res.locals.user.server_name = member.nickname || member.displayName;
        }
      }
    } catch (err) {
      // ถ้าหาไม่เจอหรือไม่พร้อม ไม่เป็นไร ใช้ค่าปกติไปก่อน
      console.warn('Could not fetch server nickname for user:', req.user.discord_user_id);
    }
  }

  res.locals.req = req;
  res.locals.version = version;
  
  // Handle Passport failure messages
  let passport_error = null;
  if (req.session.messages && req.session.messages.length > 0) {
    passport_error = req.session.messages[0];
    req.session.messages = []; // Clear after use
  }

  res.locals.error_msg = req.session.error_msg || passport_error || null;
  req.session.error_msg = null; 
  
  res.locals.success_msg = req.session.success_msg || null;
  req.session.success_msg = null;

  const { ICONS, ITEM_TYPES } = require('../utils/constants');
  res.locals.ICONS = ICONS;
  res.locals.ITEM_TYPES = ITEM_TYPES;
  res.locals.displayItemType = (type) => {
    const entry = ITEM_TYPES[type];
    return entry ? `${entry.emoji} ${entry.label}` : type;
  };

  
  next();
});

// Health check endpoint for UptimeRobot
app.get('/health', async (req, res) => {
  const discordClient = require('../bot/client');
  const db = require('../db/queries');
  
  let dbStatus = 'ok';
  try {
    await db.getCurrentRound();
  } catch (err) {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    version: version,
    uptime: process.uptime(),
    discord_bot: discordClient.isReady() ? 'online' : 'offline',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Routes (will define shortly)
app.use('/', require('./routes/auth'));
app.use('/pages', require('./routes/pages'));
app.use('/items', require('./routes/items'));
app.use('/reservations', require('./routes/reservations'));
app.use('/history', require('./routes/history'));
app.use('/whitelist', require('./routes/whitelist'));
app.use('/presets', require('./routes/presets'));

// Catch-all 404
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

module.exports = app;
