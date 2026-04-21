const db = require('./database');

// ─── Pages ────────────────────────────────────────────────────────────────────

async function getAllPages() {
  return db.all(`
    SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.page_id = p.id)::int AS item_count
    FROM pages p
    ORDER BY LENGTH(p.name) ASC, p.name ASC
  `);
}

async function addPage(name) {
  const r = await db.run('INSERT INTO pages (name) VALUES (?) RETURNING id', [name]);
  return r.lastInsertRowid;
}

async function deletePage(id) {
  return db.run('DELETE FROM pages WHERE id = ?', [id]);
}

async function deleteAllPages() {
  return db.run('DELETE FROM pages');
}

// ─── Items ────────────────────────────────────────────────────────────────────

async function getItemsForPage(pageId, roundId = null) {
  let targetRoundId = roundId;
  if (!targetRoundId) {
    const round = await getOrCreateCurrentRound();
    targetRoundId = round.id;
  }

  return db.all(`
    SELECT i.*,
           (SELECT discord_username FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS reserved_by,
           (SELECT discord_user_id FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS discord_user_id
    FROM items i
    WHERE i.page_id = ?
    ORDER BY i.position ASC
  `, [targetRoundId, targetRoundId, pageId]);
}



async function addItem(pageId, itemType, position) {
  const r = await db.run(
    'INSERT INTO items (page_id, item_type, position) VALUES (?, ?, ?) RETURNING id',
    [pageId, itemType, position]
  );
  return r.lastInsertRowid;
}

async function deleteItem(id) {
  return db.run('DELETE FROM items WHERE id = ?', [id]);
}

async function deleteItemsByPage(pageId) {
  return db.run('DELETE FROM items WHERE page_id = ?', [pageId]);
}

async function getItemById(id) {
  return db.get('SELECT * FROM items WHERE id = ?', [id]);
}

// ─── Reservations ─────────────────────────────────────────────────────────────

async function getCurrentReservations() {
  const round = await getOrCreateCurrentRound();
  return getReservationsByRound(round.id);
}

async function getReservationsByRound(roundId) {
  return db.all(`
    SELECT r.*, p.name AS page_name, i.item_type, i.position AS item_pos
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.round_id = ?
    ORDER BY r.reserved_at DESC
  `, [roundId]);
}

async function addReservation(roundId, itemId, discordUserId, discordUsername) {
  const r = await db.run(
    'INSERT INTO reservations (round_id, item_id, discord_user_id, discord_username) VALUES (?, ?, ?, ?) RETURNING id',
    [roundId, itemId, discordUserId, discordUsername]
  );
  return r.lastInsertRowid;
}

async function deleteReservation(id) {
  return db.run('DELETE FROM reservations WHERE id = ?', [id]);
}

async function isItemReserved(roundId, itemId) {
  const row = await db.get(
    'SELECT 1 FROM reservations WHERE round_id = ? AND item_id = ?',
    [roundId, itemId]
  );
  return !!row;
}

// ─── Rounds / History ─────────────────────────────────────────────────────────

async function getCurrentRound() {
  return db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
}

async function getOrCreateCurrentRound() {
  let round = await db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
  if (!round || round.status === 'closed') {
    const name = `รอบประมูล ${new Date().toLocaleString('th-TH')}`;
    const r = await db.run(
      'INSERT INTO rounds (name, status) VALUES (?, ?) RETURNING id',
      [name, 'preparing']
    );
    round = { id: r.lastInsertRowid, name, status: 'preparing' };
  }
  return round;
}

async function updateRoundStatus(roundId, status) {
  if (status === 'open') {
    return db.run('UPDATE rounds SET status = ?, created_at = NOW() WHERE id = ?', [status, roundId]);
  }
  return db.run('UPDATE rounds SET status = ? WHERE id = ?', [status, roundId]);
}

async function saveRoundBoardMessage(roundId, channelId, messageId) {
  return db.run(
    'UPDATE rounds SET board_channel_id = ?, board_message_id = ? WHERE id = ?',
    [channelId, messageId, roundId]
  );
}

async function getRoundBoardMessage(roundId) {
  return db.get('SELECT board_channel_id, board_message_id FROM rounds WHERE id = ?', [roundId]);
}

async function getHistoryByRound() {
  return db.all(`
    SELECT r.*,
           (SELECT COUNT(*) FROM round_history_items rhi
            WHERE rhi.round_id = r.id AND rhi.discord_user_id IS NOT NULL)::int AS reservation_count
    FROM rounds r
    WHERE r.status = 'closed'
    ORDER BY r.id DESC
  `);
}

async function deleteRoundHistory(roundId) {
  return db.run('DELETE FROM rounds WHERE id = ?', [roundId]);
}

async function deleteAllHistory() {
  return db.run('DELETE FROM rounds');
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

async function saveRoundSnapshot(roundId) {
  const items = await db.all(`
    SELECT i.item_type, i.position AS item_pos, p.name AS page_name,
           r.discord_user_id, r.discord_username, r.reserved_at
    FROM items i
    JOIN pages p ON i.page_id = p.id
    LEFT JOIN reservations r ON r.item_id = i.id AND r.round_id = ?
  `, [roundId]);

  for (const item of items) {
    await db.run(`
      INSERT INTO round_history_items
        (round_id, page_name, item_type, item_pos, discord_user_id, discord_username, reserved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [roundId, item.page_name, item.item_type, item.item_pos,
        item.discord_user_id, item.discord_username, item.reserved_at]);
  }
}

async function getRoundHistoryItems(roundId) {
  return db.all(
    'SELECT * FROM round_history_items WHERE round_id = ? ORDER BY LENGTH(page_name) ASC, page_name ASC, item_pos ASC',
    [roundId]
  );
}

// ─── Whitelist ────────────────────────────────────────────────────────────────

async function getAllWhitelist() {
  return db.all('SELECT * FROM whitelist ORDER BY id ASC');
}

async function isWhitelisted(discordUserId) {
  const row = await db.get('SELECT 1 FROM whitelist WHERE discord_user_id = ?', [discordUserId]);
  return !!row;
}

async function addToWhitelist(username, discordUserId) {
  const r = await db.run(
    'INSERT INTO whitelist (discord_username, discord_user_id) VALUES (?, ?) RETURNING id',
    [username, discordUserId]
  );
  return r.lastInsertRowid;
}

async function removeFromWhitelist(id) {
  return db.run('DELETE FROM whitelist WHERE id = ?', [id]);
}

// ─── Available / MyStuff ──────────────────────────────────────────────────────

async function getAvailableItems(roundId) {
  return db.all(`
    SELECT i.id, i.page_id, p.name AS page_name, i.item_type, i.position
    FROM items i
    JOIN pages p ON i.page_id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM reservations r WHERE r.item_id = i.id AND r.round_id = ?
    )
    ORDER BY LENGTH(p.name) ASC, p.name ASC, i.position ASC
  `, [roundId]);
}

async function getMyReservations(discordUserId, roundId) {
  return db.all(`
    SELECT r.id, r.item_id, p.name AS page_name, i.item_type, i.position, r.reserved_at
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.discord_user_id = ? AND r.round_id = ?
    ORDER BY LENGTH(p.name) ASC, p.name ASC, i.position ASC
  `, [discordUserId, roundId]);
}

// ─── Admins ───────────────────────────────────────────────────────────────────

async function getAdminByDiscordId(discordUserId) {
  return db.get('SELECT * FROM admin_users WHERE discord_user_id = ?', [discordUserId]);
}

async function getAllAdmins() {
  return db.all('SELECT * FROM admin_users');
}

async function addAdmin(discordUserId) {
  const r = await db.run(
    'INSERT INTO admin_users (discord_user_id) VALUES (?) RETURNING id',
    [discordUserId]
  );
  return r.lastInsertRowid;
}

async function removeAdmin(id) {
  return db.run('DELETE FROM admin_users WHERE id = ?', [id]);
}

// ─── Presets ──────────────────────────────────────────────────────────────────

async function getAllPresets() {
  return db.all('SELECT * FROM item_presets ORDER BY name ASC');
}

async function getPresetById(id) {
  return db.get('SELECT * FROM item_presets WHERE id = ?', [id]);
}

async function addPreset(name, albumCount, lightDarkCount, timeSpaceCount) {
  const r = await db.run(
    'INSERT INTO item_presets (name, album_count, light_dark_count, time_space_count) VALUES (?, ?, ?, ?) RETURNING id',
    [name, albumCount, lightDarkCount, timeSpaceCount]
  );
  return r.lastInsertRowid;
}

async function updatePreset(id, name, albumCount, lightDarkCount, timeSpaceCount) {
  return db.run(
    'UPDATE item_presets SET name = ?, album_count = ?, light_dark_count = ?, time_space_count = ? WHERE id = ?',
    [name, albumCount, lightDarkCount, timeSpaceCount, id]
  );
}

async function deletePreset(id) {
  return db.run('DELETE FROM item_presets WHERE id = ?', [id]);
}

module.exports = {
  getAllPages, addPage, deletePage, deleteAllPages,
  getItemsForPage, addItem, deleteItem, deleteItemsByPage, getItemById,
  getCurrentReservations, getReservationsByRound, addReservation, deleteReservation, isItemReserved,
  getCurrentRound, getOrCreateCurrentRound, updateRoundStatus,
  saveRoundBoardMessage, getRoundBoardMessage,
  getHistoryByRound, deleteRoundHistory, deleteAllHistory,
  saveRoundSnapshot, getRoundHistoryItems,
  getAllWhitelist, isWhitelisted, addToWhitelist, removeFromWhitelist,
  getAdminByDiscordId, getAllAdmins, addAdmin, removeAdmin,
  getAvailableItems, getMyReservations,
  getAllPresets, getPresetById, addPreset, updatePreset, deletePreset,
};
