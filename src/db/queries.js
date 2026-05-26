const db = require('./database');
const { formatThaiDate } = require('../utils/date');


// ─── Initialization ──────────────────────────────────────────────────────────
(async () => {
  try {
    await db.run('CREATE TABLE IF NOT EXISTS user_dashboards (user_id TEXT PRIMARY KEY, thread_id TEXT, message_id TEXT)');

    // Migrations
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota_ld INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota_ts INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS board_channel_id TEXT');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS board_message_id TEXT');
  } catch (err) {
    console.error('❌ Failed to initialize database tables:', err);
  }
})();

// ─── User Dashboards (For Private Thread UI) ──────────────────────────────────
async function getUserDashboard(userId) {
  return db.get('SELECT * FROM user_dashboards WHERE user_id = ?', [userId]);
}

async function saveUserDashboard(userId, threadId, messageId) {
  return db.run(`
    INSERT INTO user_dashboards (user_id, thread_id, message_id)
    VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      thread_id = EXCLUDED.thread_id,
      message_id = EXCLUDED.message_id
  `, [userId, threadId, messageId]);
}

// ─── Pages ────────────────────────────────────────────────────────────────────

async function getAllPages() {
  return db.all(`
    SELECT p.*, (SELECT COUNT(*) FROM items i WHERE i.page_id = p.id)::int AS item_count
    FROM pages p
    ORDER BY LENGTH(p.name) ASC, p.name ASC
  `);
}

/**
 * ดึงข้อมูลทั้งหมดสำหรับ Live Board ใน Query เดียว (Optimized)
 * ป้องกัน N+1 Query (เรียก DB ทีเดียวจบ)
 */
async function getAllBoardData(roundId) {
  return db.all(`
    SELECT 
      p.id AS page_id,
      p.name AS page_name,
      i.id AS item_id,
      i.item_type,
      i.position,
      r.discord_username AS reserved_by,
      r.discord_user_id
    FROM pages p
    JOIN items i ON i.page_id = p.id
    LEFT JOIN reservations r ON r.item_id = i.id AND r.round_id = $1
    ORDER BY LENGTH(p.name) ASC, p.name ASC, i.position ASC
  `, [roundId]);
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
    SELECT i.*, p.name AS page_name,
           (SELECT discord_username FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS reserved_by,
           (SELECT discord_user_id FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS discord_user_id
    FROM items i
    JOIN pages p ON i.page_id = p.id
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
  return db.get(`
    SELECT i.*, p.name AS page_name 
    FROM items i 
    JOIN pages p ON i.page_id = p.id 
    WHERE i.id = ?
  `, [id]);
}

// ─── Reservations ─────────────────────────────────────────────────────────────

async function getCurrentReservations() {
  const round = await getOrCreateCurrentRound();

  // ดึงข้อมูลแบบจัดกลุ่ม (Postgres-Compliant + Grouping Fix)
  return db.all(`
    SELECT 
      MIN(r.id) as id, 
      r.round_id, 
      i.page_id, 
      p.name as page_name,
      r.discord_user_id, 
      r.discord_username,
      MIN(r.reserved_at) as reserved_at,
      CASE 
        WHEN MAX(i.item_type) IN ('Album', 'Illution Box') THEN MAX(i.item_type)
        ELSE 'Page-Based'
      END as display_type,
      CASE 
        WHEN MAX(i.item_type) IN ('Album', 'Illution Box') THEN MAX(i.item_type) || ' ชิ้นที่ ' || MAX(i.position)
        ELSE 'ยกหน้า (' || COUNT(r.id) || ' ชิ้น)'
      END as item_display_name
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.round_id = ?
    GROUP BY 
      r.round_id, 
      i.page_id, 
      p.name, 
      r.discord_user_id, 
      r.discord_username,
      (CASE WHEN i.item_type IN ('Album', 'Illution Box') THEN i.id ELSE 0 END)
    ORDER BY reserved_at DESC
  `, [round.id]);
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

async function addMultipleReservations(roundId, itemIds, discordUserId, discordUsername) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const itemId of itemIds) {
      await client.query(
        'INSERT INTO reservations (round_id, item_id, discord_user_id, discord_username) VALUES ($1, $2, $3, $4)',
        [roundId, itemId, discordUserId, discordUsername]
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function getReservationById(id) {
  // ดึงข้อมูลการจองพร้อมประเภทไอเทมและหน้า
  return db.get(`
    SELECT r.*, i.page_id, i.item_type 
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    WHERE r.id = ?
  `, [id]);
}

async function deletePageReservationsForUser(roundId, pageId, discordUserId) {
  // ลบทุกการจองของ User นี้ ในหน้าและรอบที่กำหนด
  return db.run(`
    DELETE FROM reservations 
    WHERE round_id = ? 
    AND discord_user_id = ?
    AND item_id IN (SELECT id FROM items WHERE page_id = ?)
  `, [roundId, discordUserId, pageId]);
}

async function deleteAllUserReservationsInRound(roundId, discordUserId) {
  // ลบการจองทั้งหมดของ User นี้ในรอบปัจจุบัน ยกเว้นประเภทสมุด (Album / Illution Box)
  return db.run(`
    DELETE FROM reservations 
    WHERE round_id = ? AND discord_user_id = ?
    AND item_id NOT IN (
      SELECT id FROM items WHERE LOWER(item_type) IN ('album', 'illution box', 'illution-box', 'สมุดการ์ด')
    )
  `, [roundId, discordUserId]);
}

async function deleteSingleReservation(roundId, itemId, discordUserId) {
  return db.run(
    'DELETE FROM reservations WHERE round_id = ? AND item_id = ? AND discord_user_id = ?',
    [roundId, itemId, discordUserId]
  );
}



// ─── Rounds / History ─────────────────────────────────────────────────────────

async function getCurrentRound() {
  return db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
}

async function getOrCreateCurrentRound() {
  let round = await db.get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1');
  if (!round || round.status === 'closed') {
    const name = `รอบประมูล ${formatThaiDate(new Date(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    const r = await db.run(
      'INSERT INTO rounds (name, status, quota, quota_ld, quota_ts) VALUES (?, ?, 1, 1, 1) RETURNING id',
      [name, 'preparing']
    );
    round = { id: r.lastInsertRowid, name, status: 'preparing', quota: 1, quota_ld: 1, quota_ts: 1 };
  }
  return round;
}

async function updateRoundQuota(roundId, type, quota) {
  if (type === 'ld') {
    return db.run('UPDATE rounds SET quota_ld = ? WHERE id = ?', [quota, roundId]);
  } else if (type === 'ts') {
    return db.run('UPDATE rounds SET quota_ts = ? WHERE id = ?', [quota, roundId]);
  }
  return db.run('UPDATE rounds SET quota = ? WHERE id = ?', [quota, roundId]);
}

async function getRoundById(id) {
  return db.get('SELECT * FROM rounds WHERE id = ?', [id]);
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

async function getAllWhitelist(onlyActive = false) {
  if (onlyActive) {
    return db.all('SELECT * FROM whitelist WHERE is_active = true ORDER BY id ASC');
  }
  return db.all('SELECT * FROM whitelist ORDER BY is_active DESC, id ASC');
}

async function isWhitelisted(discordUserId) {
  const row = await db.get('SELECT 1 FROM whitelist WHERE discord_user_id = ? AND is_active = true', [discordUserId]);
  return !!row;
}

async function toggleWhitelistStatus(id, isActive) {
  return db.run('UPDATE whitelist SET is_active = ? WHERE id = ?', [isActive, id]);
}

async function recordLotteryResults(participantIds, winnerIds) {
  if (participantIds.length === 0) return;

  const winnerIdSet = new Set(winnerIds.map(id => id.toString()));

  // 1. เพิ่ม spin_count ให้กับทุกคนที่มีชื่อในวงล้อ และบันทึกลง lottery_logs
  const pPlaceholders = participantIds.map(() => '?').join(',');
  await db.run(`UPDATE whitelist SET spin_count = spin_count + 1 WHERE id IN (${pPlaceholders})`, [...participantIds]);

  // บันทึก Log ละเอียดรายคน
  for (const pid of participantIds) {
    const isWinner = winnerIdSet.has(pid.toString());
    await db.run('INSERT INTO lottery_logs (whitelist_id, is_winner) VALUES (?, ?)', [pid, isWinner]);
  }

  // 2. เพิ่ม win_count ให้กับผู้ชนะ
  if (winnerIds.length > 0) {
    const wPlaceholders = winnerIds.map(() => '?').join(',');
    await db.run(`UPDATE whitelist SET win_count = win_count + 1 WHERE id IN (${wPlaceholders})`, [...winnerIds]);
  }
}

async function getMemberLotteryHistory(whitelistId) {
  return db.all('SELECT * FROM lottery_logs WHERE whitelist_id = ? ORDER BY created_at DESC', [whitelistId]);
}

async function getWhitelistMemberById(id) {
  return db.get('SELECT * FROM whitelist WHERE id = ?', [id]);
}

async function bulkUpdateWhitelistStatus(ids, isActive) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  return db.run(`UPDATE whitelist SET is_active = ? WHERE id IN (${placeholders})`, [isActive, ...ids]);
}

async function autoAssignWhitelist(roundId) {
  // 1. Get active whitelist members
  const activeWhitelist = await getAllWhitelist(true);

  // 2. Get available Album slots (that don't have any reservation in this round)
  const availableAlbums = await db.all(`
    SELECT i.id
    FROM items i
    LEFT JOIN reservations r ON r.item_id = i.id AND r.round_id = ?
    WHERE i.item_type IN ('Album', 'Illution Box') AND r.id IS NULL
    ORDER BY (CASE WHEN i.item_type = 'Album' THEN 1 ELSE 2 END) ASC, i.id ASC
  `, [roundId]);

  const assigned = [];
  let albumIdx = 0; // ตัวชี้ตำแหน่งสินค้าที่ว่าง

  // 3. วนลูปรายชื่อ Whitelist ทุกคน เพื่อแจกจ่ายสินค้าที่ว่างอยู่
  for (const member of activeWhitelist) {
    if (albumIdx >= availableAlbums.length) break;
    if (!member.discord_user_id) continue;

    // จองให้ทันทีตามลำดับ โดยไม่สนใจว่าคนนี้จะมีรายการจองอื่นอยู่แล้วหรือไม่ 
    // (เพื่อให้สามารถมี 2 เล่มได้ถ้าแอดมินจอง Manual ไว้ก่อนหน้า)
    const album = availableAlbums[albumIdx];
    await addReservation(roundId, album.id, member.discord_user_id, member.discord_username);
    assigned.push(member.discord_username);
    albumIdx++; // ขยับไปช่องสินค้าถัดไป
  }

  return assigned;
}



async function addToWhitelist(username, discordUserId) {
  const r = await db.run(
    'INSERT INTO whitelist (discord_username, discord_user_id, is_active) VALUES (?, ?, true) RETURNING id',
    [username, discordUserId]
  );
  return r.lastInsertRowid;
}

async function removeFromWhitelist(id) {
  return db.run('DELETE FROM whitelist WHERE id = ?', [id]);
}

async function updateWhitelistUsername(id, username) {
  return db.run('UPDATE whitelist SET discord_username = ? WHERE id = ?', [username, id]);
}

async function updateUserReservationsUsername(discordUserId, username) {
  return db.run('UPDATE reservations SET discord_username = ? WHERE discord_user_id = ?', [username, discordUserId]);
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
    SELECT r.id, r.item_id, i.page_id, p.name AS page_name, i.item_type, i.position, r.reserved_at
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

async function addPreset(name, albumCount, illutionBoxCount, lightDarkCount, timeSpaceCount) {
  const r = await db.run(
    'INSERT INTO item_presets (name, album_count, illution_box_count, light_dark_count, time_space_count) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [name, albumCount, illutionBoxCount, lightDarkCount, timeSpaceCount]
  );
  return r.lastInsertRowid;
}

async function updatePreset(id, name, albumCount, illutionBoxCount, lightDarkCount, timeSpaceCount) {
  return db.run(
    'UPDATE item_presets SET name = ?, album_count = ?, illution_box_count = ?, light_dark_count = ?, time_space_count = ? WHERE id = ?',
    [name, albumCount, illutionBoxCount, lightDarkCount, timeSpaceCount, id]
  );
}

async function deletePreset(id) {
  return db.run('DELETE FROM item_presets WHERE id = ?', [id]);
}

// ─── Parties & Wheel ──────────────────────────────────────────────────────────

async function getAllParties() {
  return db.all('SELECT * FROM parties ORDER BY id ASC');
}

async function addParty(name) {
  return db.run('INSERT INTO parties (name) VALUES (?)', [name]);
}

async function updatePartyName(id, name) {
  return db.run('UPDATE parties SET name = ? WHERE id = ?', [name, id]);
}

async function getPartyMembers() {
  return db.all(`
    SELECT pm.*, w.discord_username, w.discord_user_id, p.name as party_name
    FROM party_members pm
    JOIN whitelist w ON pm.whitelist_id = w.id
    JOIN parties p ON pm.party_id = p.id
  `);
}

async function addMemberToParty(partyId, whitelistId) {
  return db.run('INSERT INTO party_members (party_id, whitelist_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [partyId, whitelistId]);
}

async function removeMemberFromParty(partyId, whitelistId) {
  return db.run('DELETE FROM party_members WHERE party_id = ? AND whitelist_id = ?', [partyId, whitelistId]);
}

async function getPartyByDiscordUserId(discordUserId) {
  return db.get(`
    SELECT p.*, pm.whitelist_id 
    FROM party_members pm
    JOIN whitelist w ON pm.whitelist_id = w.id
    JOIN parties p ON pm.party_id = p.id
    WHERE w.discord_user_id = ?
  `, [discordUserId]);
}

async function addWheelEntry(submittedBy, nom1, nom2) {
  await db.run('DELETE FROM wheel_entries WHERE submitted_by = ?', [submittedBy]);
  return db.run(
    'INSERT INTO wheel_entries (submitted_by, nominated_1, nominated_2) VALUES (?, ?, ?)',
    [submittedBy, nom1, nom2]
  );
}

async function getLatestWheelEntries() {
  return db.all('SELECT * FROM wheel_entries ORDER BY created_at DESC');
}


module.exports = {
  getAllPages, addPage, deletePage, deleteAllPages,
  getItemsForPage, addItem, deleteItem, deleteItemsByPage, getItemById,
  getCurrentReservations, getReservationsByRound, addReservation, addMultipleReservations, deleteReservation, isItemReserved,
  getReservationById, deletePageReservationsForUser, deleteAllUserReservationsInRound, deleteSingleReservation,
  getCurrentRound, getOrCreateCurrentRound, getRoundById, updateRoundStatus,
  saveRoundBoardMessage, getRoundBoardMessage,
  getHistoryByRound, deleteRoundHistory, deleteAllHistory,
  saveRoundSnapshot, getRoundHistoryItems,
  getAllWhitelist, isWhitelisted, addToWhitelist, removeFromWhitelist, toggleWhitelistStatus, bulkUpdateWhitelistStatus, recordLotteryResults, getMemberLotteryHistory, getWhitelistMemberById, updateWhitelistUsername, updateUserReservationsUsername,
  getAdminByDiscordId, getAllAdmins, addAdmin, removeAdmin,



  getAvailableItems, getMyReservations,
  getAllPresets, getPresetById, addPreset, updatePreset, deletePreset,
  getAllParties, addParty, updatePartyName, getPartyMembers, addMemberToParty, removeMemberFromParty, getPartyByDiscordUserId, addWheelEntry, getLatestWheelEntries,
  getAllBoardData,
  updateRoundQuota,
  autoAssignWhitelist,
  getUserDashboard,
  saveUserDashboard,
};
