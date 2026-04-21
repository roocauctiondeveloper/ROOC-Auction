const db = require('./database');
const config = require('../config');

// Helper to handle date functions across databases
const NOW_FUNC = config.databaseType === 'postgres' ? 'NOW()' : "datetime('now')";

// --- 2.3 Page Queries ---
async function getAllPages() {
  return await db.all(`
    SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.page_id = p.id) as item_count 
    FROM pages p
    ORDER BY LENGTH(p.name) ASC, p.name ASC
  `);
}

async function addPage(name) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO pages (name) VALUES (?) RETURNING id' 
    : 'INSERT INTO pages (name) VALUES (?)';
    
  const result = await db.run(sql, [name]);
  return result.lastInsertRowid;
}

async function deletePage(id) {
  return await db.run('DELETE FROM pages WHERE id = ?', [id]);
}

async function deleteAllPages() {
  return await db.run('DELETE FROM pages');
}

// --- 2.4 Item Queries ---
async function getItemsForPage(pageId) {
  const currentRound = await getOrCreateCurrentRound();
  return await db.all(`
    SELECT i.*, 
           (SELECT discord_username FROM reservations r WHERE r.item_id = i.id AND r.round_id = ?) as reserved_by
    FROM items i
    WHERE i.page_id = ?
    ORDER BY i.position ASC
  `, [currentRound.id, pageId]);
}

async function addItem(pageId, itemType, position) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO items (page_id, item_type, position) VALUES (?, ?, ?) RETURNING id' 
    : 'INSERT INTO items (page_id, item_type, position) VALUES (?, ?, ?)';

  const result = await db.run(sql, [pageId, itemType, position]);
  return result.lastInsertRowid;
}

async function deleteItem(id) {
  return await db.run('DELETE FROM items WHERE id = ?', [id]);
}

async function deleteItemsByPage(pageId) {
  return await db.run('DELETE FROM items WHERE page_id = ?', [pageId]);
}

async function getItemById(id) {
  return await db.get('SELECT * FROM items WHERE id = ?', [id]);
}

// --- 2.5 Reservation Queries ---
async function getCurrentReservations() {
  const currentRound = await getOrCreateCurrentRound();
  return await getReservationsByRound(currentRound.id);
}

async function getReservationsByRound(roundId) {
  return await db.all(`
    SELECT r.*, p.name as page_name, i.item_type, i.position as item_pos
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.round_id = ?
    ORDER BY r.reserved_at DESC
  `, [roundId]);
}

async function addReservation(roundId, itemId, discordUserId, discordUsername) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO reservations (round_id, item_id, discord_user_id, discord_username) VALUES (?, ?, ?, ?) RETURNING id' 
    : 'INSERT INTO reservations (round_id, item_id, discord_user_id, discord_username) VALUES (?, ?, ?, ?)';

  const result = await db.run(sql, [roundId, itemId, discordUserId, discordUsername]);
  return result.lastInsertRowid;
}

async function deleteReservation(id) {
  return await db.run('DELETE FROM reservations WHERE id = ?', [id]);
}

async function isItemReserved(roundId, itemId) {
  const row = await db.get('SELECT 1 FROM reservations WHERE round_id = ? AND item_id = ?', [roundId, itemId]);
  return !!row;
}

// --- 2.6 Round/History Queries ---
async function getCurrentRound() {
  return await db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
}

async function getOrCreateCurrentRound() {
  let round = await db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
  if (!round || round.status === 'closed') {
    const name = `รอบประมูล ${new Date().toLocaleString('th-TH')}`;
    const sql = config.databaseType === 'postgres' 
      ? 'INSERT INTO rounds (name, status) VALUES (?, ?) RETURNING id' 
      : 'INSERT INTO rounds (name, status) VALUES (?, ?)';

    const result = await db.run(sql, [name, 'preparing']);
    round = { id: result.lastInsertRowid, name, status: 'preparing' };
  }
  return round;
}

async function updateRoundStatus(roundId, status) {
  if (status === 'open') {
    return await db.run(`UPDATE rounds SET status = ?, created_at = ${NOW_FUNC} WHERE id = ?`, [status, roundId]);
  } else {
    return await db.run('UPDATE rounds SET status = ? WHERE id = ?', [status, roundId]);
  }
}


async function getHistoryByRound() {
  return await db.all(`
    SELECT r.*, 
           (SELECT COUNT(*) FROM round_history_items rhi WHERE rhi.round_id = r.id AND rhi.discord_user_id IS NOT NULL) as reservation_count
    FROM rounds r
    WHERE r.status = 'closed'
    ORDER BY r.id DESC
  `);
}

async function deleteRoundHistory(roundId) {
  return await db.run('DELETE FROM rounds WHERE id = ?', [roundId]);
}

async function deleteAllHistory() {
  return await db.run('DELETE FROM rounds');
}

// --- 2.7 Snapshot Queries ---
async function saveRoundSnapshot(roundId) {
  const items = await db.all(`
    SELECT i.item_type, i.position as item_pos, p.name as page_name,
           r.discord_user_id, r.discord_username, r.reserved_at
    FROM items i
    JOIN pages p ON i.page_id = p.id
    LEFT JOIN reservations r ON r.item_id = i.id AND r.round_id = ?
  `, [roundId]);

  for (const item of items) {
    await db.run(`
      INSERT INTO round_history_items (round_id, page_name, item_type, item_pos, discord_user_id, discord_username, reserved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [roundId, item.page_name, item.item_type, item.item_pos, item.discord_user_id, item.discord_username, item.reserved_at]);
  }
}

async function getRoundHistoryItems(roundId) {
  return await db.all('SELECT * FROM round_history_items WHERE round_id = ? ORDER BY LENGTH(page_name) ASC, page_name ASC, item_pos ASC', [roundId]);
}

// --- 2.8 Whitelist Queries ---
async function getAllWhitelist() {
  return await db.all('SELECT * FROM whitelist ORDER BY id ASC');
}

async function isWhitelisted(discordUserId) {
  const row = await db.get('SELECT 1 FROM whitelist WHERE discord_user_id = ?', [discordUserId]);
  return !!row;
}

async function addToWhitelist(username, discordUserId) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO whitelist (discord_username, discord_user_id) VALUES (?, ?) RETURNING id' 
    : 'INSERT INTO whitelist (discord_username, discord_user_id) VALUES (?, ?)';

  const result = await db.run(sql, [username, discordUserId]);
  return result.lastInsertRowid;
}

async function removeFromWhitelist(id) {
  return await db.run('DELETE FROM whitelist WHERE id = ?', [id]);
}

// --- 2.9 Available / MyStuff Queries ---

async function getAvailableItems(roundId) {
  return await db.all(`
    SELECT i.id, i.page_id, p.name as page_name, i.item_type, i.position
    FROM items i
    JOIN pages p ON i.page_id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM reservations r WHERE r.item_id = i.id AND r.round_id = ?
    )
    ORDER BY LENGTH(p.name) ASC, p.name ASC, i.position ASC
  `, [roundId]);
}

async function getMyReservations(discordUserId, roundId) {
  return await db.all(`
    SELECT r.id, r.item_id, p.name as page_name, i.item_type, i.position, r.reserved_at
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.discord_user_id = ? AND r.round_id = ?
    ORDER BY LENGTH(p.name) ASC, p.name ASC, i.position ASC
  `, [discordUserId, roundId]);
}

// --- 2.8 Admin Queries ---
async function getAdminByDiscordId(discordUserId) {
  return await db.get('SELECT * FROM admin_users WHERE discord_user_id = ?', [discordUserId]);
}

async function getAllAdmins() {
  return await db.all('SELECT * FROM admin_users');
}

async function addAdmin(discordUserId) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO admin_users (discord_user_id) VALUES (?) RETURNING id' 
    : 'INSERT INTO admin_users (discord_user_id) VALUES (?)';

  const result = await db.run(sql, [discordUserId]);
  return result.lastInsertRowid;
}

async function removeAdmin(id) {
  return await db.run('DELETE FROM admin_users WHERE id = ?', [id]);
}

// --- 3.0 Preset Queries ---
async function getAllPresets() {
  return await db.all('SELECT * FROM item_presets ORDER BY name ASC');
}

async function addPreset(name, album, ld, ts) {
  const sql = config.databaseType === 'postgres' 
    ? 'INSERT INTO item_presets (name, album_count, light_dark_count, time_space_count) VALUES (?, ?, ?, ?) RETURNING id' 
    : 'INSERT INTO item_presets (name, album_count, light_dark_count, time_space_count) VALUES (?, ?, ?, ?)';
  const result = await db.run(sql, [name, album, ld, ts]);
  return result.lastInsertRowid;
}

async function deletePreset(id) {
  return await db.run('DELETE FROM item_presets WHERE id = ?', [id]);
}

async function getPresetById(id) {
  return await db.get('SELECT * FROM item_presets WHERE id = ?', [id]);
}

module.exports = {
  getAllPages, addPage, deletePage, deleteAllPages,
  getItemsForPage, addItem, deleteItem, deleteItemsByPage, getItemById,
  getCurrentReservations, getReservationsByRound, addReservation, deleteReservation, isItemReserved,
  getCurrentRound, getOrCreateCurrentRound, updateRoundStatus, getHistoryByRound, deleteRoundHistory, deleteAllHistory,
  saveRoundSnapshot, getRoundHistoryItems,
  getAllWhitelist, isWhitelisted, addToWhitelist, removeFromWhitelist,
  getAdminByDiscordId, getAllAdmins, addAdmin, removeAdmin,
  getAvailableItems, getMyReservations,
  getAllPresets, addPreset, deletePreset, getPresetById
};
