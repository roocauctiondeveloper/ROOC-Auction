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

// Health check endpoint for UptimeRobot (Must be before session middleware)
app.get('/health', async (req, res) => {
  const discordClient = require('../bot/client');
  const db = require('../db/queries');
  
  let dbStatus = 'skipped';
  
  // Only check database if explicitly requested via query parameter
  if (req.query.check_db === 'true') {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
      await Promise.race([db.getCurrentRound(), timeout]);
      dbStatus = 'ok';
    } catch (err) {
      dbStatus = err.message === 'timeout' ? 'timeout' : 'error';
    }
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
  const db = require('../db/database'); // Import shared pool
  sessionStore = new pgSession({
    pool: db.pool, // Use the shared pool
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
    // ใช้ค่าจาก Session ถ้ามี เพื่อลดการเรียก Discord API ทุก Request
    if (req.session.server_name) {
      res.locals.user.server_name = req.session.server_name;
    } else {
      try {
        const botClient = require('../bot/client');
        const guildId = config.discordGuildId;
        
        if (botClient.isReady() && guildId) {
          const guild = await botClient.guilds.fetch(guildId);
          const member = await guild.members.fetch(req.user.discord_user_id);
          
          if (member) {
            const displayName = member.nickname || member.displayName;
            res.locals.user.server_name = displayName;
            req.session.server_name = displayName; // เก็บใส่ session
          }
        }
      } catch (err) {
        console.warn('Could not fetch server nickname for user:', req.user.discord_user_id);
      }
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

  const { ICONS, ITEM_TYPES, BRANDING } = require('../utils/constants');
  res.locals.ICONS = ICONS;
  res.locals.ITEM_TYPES = ITEM_TYPES;
  res.locals.BRANDING = BRANDING;
  const { formatThaiDate, formatThaiTime } = require('../utils/date');
  res.locals.formatDate = formatThaiDate;
  res.locals.formatTime = formatThaiTime;
  res.locals.displayItemType = (type) => {
    const entry = ITEM_TYPES[type];
    return entry ? `${entry.emoji} ${entry.label}` : type;
  };

  
  next();
});


// Routes (will define shortly)
app.use('/', require('./routes/auth'));
app.use('/pages', require('./routes/pages'));
app.use('/items', require('./routes/items'));
app.use('/reservations', require('./routes/reservations'));
app.use('/history', require('./routes/history'));
app.use('/whitelist', require('./routes/whitelist'));
app.use('/presets', require('./routes/presets'));
app.use('/parties', require('./routes/parties'));
app.use('/jobs', require('./routes/jobs'));

// Catch-all 404
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

module.exports = app;
