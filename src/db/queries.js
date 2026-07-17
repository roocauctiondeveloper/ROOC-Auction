const db = require('./database');
const { formatThaiDate, formatEnDate } = require('../utils/date');


// ─── Initialization ──────────────────────────────────────────────────────────
(async () => {
  try {
    await db.run('CREATE TABLE IF NOT EXISTS user_dashboards (user_id TEXT PRIMARY KEY, thread_id TEXT, message_id TEXT)');
    await db.run("CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY, language TEXT NOT NULL DEFAULT 'en')");

    // Migrations
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota_ld INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quota_ts INTEGER DEFAULT 1');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS board_channel_id TEXT');
    await db.exec('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS board_message_id TEXT');
    await db.exec('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS transferred_from_name TEXT');
    await db.exec('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS transferred_to_id TEXT');
    await db.exec('ALTER TABLE reservations ADD COLUMN IF NOT EXISTS transferred_to_name TEXT');
    await db.exec('ALTER TABLE round_history_items ADD COLUMN IF NOT EXISTS transferred_from_name TEXT');

    await db.exec('ALTER TABLE whitelist ADD COLUMN IF NOT EXISTS job TEXT');
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS whitelist_discord_user_id_key ON whitelist (discord_user_id)');
    await db.run(`
      CREATE TABLE IF NOT EXISTS job_change_logs (
        id               SERIAL PRIMARY KEY,
        discord_user_id  TEXT NOT NULL,
        discord_username TEXT NOT NULL,
        old_job          TEXT,
        new_job          TEXT,
        changed_by       TEXT NOT NULL,
        changed_by_name  TEXT NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Migrate existing job names to ROOC names
    await db.run("UPDATE whitelist SET job = 'Professor' WHERE job = 'Scholar'");
    await db.run("UPDATE whitelist SET job = 'Minstrel' WHERE job = 'Clown'");
    await db.run("UPDATE whitelist SET job = 'Mastersmith' WHERE job = 'Whitesmith'");
    await db.run("UPDATE whitelist SET job = 'Biochemist' WHERE job = 'Creator'");

    await db.run("UPDATE job_change_logs SET new_job = 'Professor' WHERE new_job = 'Scholar'");
    await db.run("UPDATE job_change_logs SET new_job = 'Minstrel' WHERE new_job = 'Clown'");
    await db.run("UPDATE job_change_logs SET new_job = 'Mastersmith' WHERE new_job = 'Whitesmith'");
    await db.run("UPDATE job_change_logs SET new_job = 'Biochemist' WHERE new_job = 'Creator'");

    await db.run("UPDATE job_change_logs SET old_job = 'Professor' WHERE old_job = 'Scholar'");
    await db.run("UPDATE job_change_logs SET old_job = 'Minstrel' WHERE old_job = 'Clown'");
    await db.run("UPDATE job_change_logs SET old_job = 'Mastersmith' WHERE old_job = 'Whitesmith'");
    await db.run("UPDATE job_change_logs SET old_job = 'Biochemist' WHERE old_job = 'Creator'");

    // Check if transfers table needs schema upgrade to support multiple items
    try {
      await db.run('SELECT item_ids FROM transfers LIMIT 1');
    } catch (e) {
      console.warn('⚠️ Old schema detected for transfers. Recreating tables for multi-item transfers...');
      await db.run('DROP TABLE IF EXISTS transfers');
      await db.run('DROP TABLE IF EXISTS transfer_logs');
    }

    // Transfers and transfer_logs tables
    await db.run(`
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        round_id INTEGER NOT NULL,
        item_ids TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        bank_name TEXT,
        bank_account_number TEXT,
        bank_account_name TEXT,
        payment_qr_url TEXT,
        promptpay_id TEXT,
        promptpay_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS transfer_logs (
        id SERIAL PRIMARY KEY,
        round_id INTEGER NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        item_names TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        slip_url TEXT,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Retroactively sync transferred columns for old completed transfers
    if (process.env.NODE_ENV !== 'test') {
      try {
        const completedTransfers = await db.all("SELECT round_id, item_ids, sender_id, sender_name, recipient_id, recipient_name FROM transfers WHERE status = 'completed'");
        if (completedTransfers && completedTransfers.length > 0) {
          console.log(`⏳ Retroactively syncing ${completedTransfers.length} completed transfers (restoring original owner & setting transferred_to overlay)...`);
          for (const t of completedTransfers) {
            let itemIds = [];
            try {
              itemIds = JSON.parse(t.item_ids || '[]');
            } catch (e) {
              if (t.item_ids) itemIds = [parseInt(t.item_ids)];
            }
            for (const itemId of itemIds) {
              if (itemId) {
                await db.run(
                  `UPDATE reservations 
                   SET discord_user_id = ?, 
                       discord_username = ?, 
                       transferred_to_id = ?, 
                       transferred_to_name = ?
                   WHERE round_id = ? AND item_id = ?`,
                  [t.sender_id, t.sender_name, t.recipient_id, t.recipient_name, t.round_id, itemId]
                );
              }
            }
          }
          console.log('✅ Retroactive sync of transferred_to columns complete.');
        }
      } catch (syncErr) {
        console.warn('⚠️ Could not retroactively sync transferred columns:', syncErr.message);
      }
    }
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
      COALESCE(r.transferred_to_name, r.discord_username) AS reserved_by,
      COALESCE(r.transferred_to_id, r.discord_user_id) AS discord_user_id
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
           (SELECT COALESCE(r.transferred_to_name, r.discord_username) FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS reserved_by,
           (SELECT COALESCE(r.transferred_to_id, r.discord_user_id) FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS discord_user_id,
           (SELECT CASE WHEN r.transferred_to_name IS NOT NULL THEN r.discord_username ELSE NULL END FROM reservations r
            WHERE r.item_id = i.id AND r.round_id = ?) AS transferred_from_name
    FROM items i
    JOIN pages p ON i.page_id = p.id
    WHERE i.page_id = ?
    ORDER BY i.position ASC
  `, [targetRoundId, targetRoundId, targetRoundId, pageId]);
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
      COALESCE(r.transferred_to_id, r.discord_user_id) as discord_user_id, 
      COALESCE(r.transferred_to_name, r.discord_username) as discord_username,
      MIN(r.reserved_at) as reserved_at,
      MIN(CASE WHEN r.transferred_to_name IS NOT NULL THEN r.discord_username ELSE NULL END) as transferred_from_name,
      CASE 
        WHEN MAX(i.item_type) IN ('Album', 'Illution Box') THEN MAX(i.item_type)
        ELSE 'Page-Based'
      END as display_type,
      CASE 
        WHEN MAX(i.item_type) IN ('Album', 'Illution Box') THEN MAX(i.item_type) || ' item #' || MAX(i.position)
        ELSE 'Full page (' || COUNT(r.id) || ' items)'
      END as item_display_name
    FROM reservations r
    JOIN items i ON r.item_id = i.id
    JOIN pages p ON i.page_id = p.id
    WHERE r.round_id = ?
    GROUP BY 
      r.round_id, 
      i.page_id, 
      p.name, 
      COALESCE(r.transferred_to_id, r.discord_user_id), 
      COALESCE(r.transferred_to_name, r.discord_username),
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
    const name = `Auction Round ${formatEnDate(new Date(), {
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
           COALESCE(r.transferred_to_id, r.discord_user_id) AS discord_user_id,
           COALESCE(r.transferred_to_name, r.discord_username) AS discord_username,
           r.reserved_at,
           CASE WHEN r.transferred_to_name IS NOT NULL THEN r.discord_username ELSE NULL END AS transferred_from_name
    FROM items i
    JOIN pages p ON i.page_id = p.id
    LEFT JOIN reservations r ON r.item_id = i.id AND r.round_id = ?
  `, [roundId]);

  for (const item of items) {
    await db.run(`
      INSERT INTO round_history_items
        (round_id, page_name, item_type, item_pos, discord_user_id, discord_username, reserved_at, transferred_from_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [roundId, item.page_name, item.item_type, item.item_pos,
      item.discord_user_id, item.discord_username, item.reserved_at, item.transferred_from_name]);
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

async function getWhitelistMemberByDiscordId(discordUserId) {
  return db.get('SELECT * FROM whitelist WHERE discord_user_id = ?', [discordUserId]);
}

async function bulkUpdateWhitelistStatus(ids, isActive) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  return db.run(`UPDATE whitelist SET is_active = ? WHERE id IN (${placeholders})`, [isActive, ...ids]);
}

async function getUserPreference(userId) {
  return db.get('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
}

async function saveUserLanguage(userId, language) {
  return db.run(`
    INSERT INTO user_preferences (user_id, language)
    VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      language = EXCLUDED.language
  `, [userId, language]);
}

async function setOnlyWhitelistActive(ids) {
  const activeIds = [...new Set(ids.map(id => parseInt(id)).filter(id => !isNaN(id)))];
  return db.run('UPDATE whitelist SET is_active = (id = ANY($1::int[]))', [activeIds]);
}

async function resetAllWhitelistStandby() {
  return db.run('UPDATE whitelist SET is_active = false');
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

async function deleteWheelEntriesByParty(partyId) {
  const rows = await db.all(`
    SELECT w.discord_user_id 
    FROM party_members pm
    JOIN whitelist w ON pm.whitelist_id = w.id
    WHERE pm.party_id = ? AND w.discord_user_id IS NOT NULL AND w.discord_user_id != ''
  `, [partyId]);
  
  const userIds = rows.map(r => r.discord_user_id);
  if (userIds.length > 0) {
    // SQLite/Postgres dynamic placeholders
    const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(',');
    await db.pool.query(`DELETE FROM wheel_entries WHERE submitted_by IN (${placeholders})`, userIds);
  }
}

async function getAllWhitelistWithParty() {
  return db.all(`
    SELECT w.*, p.name AS party_name 
    FROM whitelist w
    LEFT JOIN party_members pm ON pm.whitelist_id = w.id
    LEFT JOIN parties p ON pm.party_id = p.id
    ORDER BY w.is_active DESC, w.id ASC
  `);
}

async function saveUserJob(discordUserId, discordUsername, job) {
  const existing = await db.get('SELECT job FROM whitelist WHERE discord_user_id = ?', [discordUserId]);
  const oldJob = existing ? existing.job : null;

  await db.run(`
    INSERT INTO whitelist (discord_username, discord_user_id, job, is_active)
    VALUES (?, ?, ?, true)
    ON CONFLICT (discord_user_id) DO UPDATE SET
      job = EXCLUDED.job,
      discord_username = EXCLUDED.discord_username
  `, [discordUsername, discordUserId, job]);

  if (!existing || oldJob !== job) {
    await db.run(`
      INSERT INTO job_change_logs (discord_user_id, discord_username, old_job, new_job, changed_by, changed_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [discordUserId, discordUsername, oldJob, job, 'discord', discordUsername]);
  }
}

async function updateWhitelistJob(id, job, adminUserId, adminUsername) {
  const member = await db.get('SELECT discord_user_id, discord_username, job FROM whitelist WHERE id = ?', [id]);
  if (!member) throw new Error('Member not found');
  const oldJob = member.job;

  await db.run('UPDATE whitelist SET job = ? WHERE id = ?', [job, id]);

  if (oldJob !== job) {
    await db.run(`
      INSERT INTO job_change_logs (discord_user_id, discord_username, old_job, new_job, changed_by, changed_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [member.discord_user_id, member.discord_username, oldJob, job, adminUserId, adminUsername]);
  }
}

async function getJobChangeLogs() {
  return db.all('SELECT * FROM job_change_logs ORDER BY created_at DESC LIMIT 100');
}

// ─── Transfers & Payment ──────────────────────────────────────────────────────

// Helper to enrich transfers with item details from items table
async function enrichTransfers(transfers) {
  if (!transfers) return null;
  const isArray = Array.isArray(transfers);
  const rows = isArray ? transfers : [transfers];
  
  for (const t of rows) {
    const itemIds = JSON.parse(t.item_ids || '[]');
    t.items = [];
    
    for (const itemId of itemIds) {
      const item = await getItemById(itemId);
      if (item) {
        t.items.push(item);
      }
    }

    // Sort items by page name and position ascending
    t.items.sort((a, b) => {
      const pageCompare = (a.page_name || '').localeCompare(b.page_name || '', undefined, { numeric: true, sensitivity: 'base' });
      if (pageCompare !== 0) return pageCompare;
      return (a.position || 0) - (b.position || 0);
    });

    // Generate compactSummary
    const summaryList = [];
    if (t.items.length > 0) {
      // Group items by page_id AND item_type
      const pageGroups = {};
      t.items.forEach(item => {
        const key = `${item.page_id}||${item.item_type}`;
        if (!pageGroups[key]) {
          pageGroups[key] = {
            page_id: item.page_id,
            page_name: item.page_name,
            item_type: item.item_type,
            items: []
          };
        }
        pageGroups[key].items.push(item);
      });

      const getCompactItemTypeDesc = (type) => {
        if (type === 'Light-Dark') return '🤍 Light-Dark';
        if (type === 'Time-Space') return '❤️ Time-Space';
        if (type === 'Album') return '📒 Album';
        if (type === 'Illution Box') return '🧩 Box';
        if (type === 'Feather') return '🪶 Feather';
        if (type === 'Card') return '🎴 Card';
        if (type === 'Book') return '📖 Book';
        return type;
      };

      for (const key of Object.keys(pageGroups)) {
        const group = pageGroups[key];
        // Query total items of this type on this page
        const countRes = await db.get('SELECT COUNT(*) as count FROM items WHERE page_id = ? AND item_type = ?', [group.page_id, group.item_type]);
        const totalItemsOfTypeOnPage = countRes ? parseInt(countRes.count) : 0;

        const typeDesc = getCompactItemTypeDesc(group.item_type);

        if (group.items.length === totalItemsOfTypeOnPage && totalItemsOfTypeOnPage > 0) {
          summaryList.push(`${typeDesc} 📄 ${group.page_name} (ทั้งหมด)`);
        } else {
          const positionsStr = group.items.map(i => `#${i.position}`).join(', ');
          summaryList.push(`${typeDesc} 📄 ${group.page_name} (${positionsStr})`);
        }
      }
    }
    t.compactSummary = summaryList;
    
    // For EJS compatibility
    if (t.items.length > 0) {
      t.page_name = t.items.map(i => i.page_name).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      t.item_type = t.items[0].item_type; // Fallback to first item type
    } else {
      t.page_name = 'Unknown';
      t.item_type = 'General';
    }
  }
  
  return isArray ? rows : rows[0];
}

async function createTransfer(roundId, itemIds, senderId, senderName, recipientId, recipientName, bankName, bankAccNum, bankAccName, qrUrl, promptPayId, promptPayName) {
  const itemIdsStr = JSON.stringify(itemIds);
  const r = await db.run(`
    INSERT INTO transfers (
      round_id, item_ids, sender_id, sender_name, recipient_id, recipient_name,
      bank_name, bank_account_number, bank_account_name, payment_qr_url, promptpay_id, promptpay_name, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending') RETURNING id
  `, [
    roundId, itemIdsStr, senderId, senderName, recipientId, recipientName,
    bankName || null, bankAccNum || null, bankAccName || null, qrUrl || null, promptPayId || null, promptPayName || null
  ]);
  return r.lastInsertRowid;
}

async function getPendingTransfersForRecipient(recipientId) {
  const transfers = await db.all(`
    SELECT * FROM transfers
    WHERE recipient_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `, [recipientId]);
  return enrichTransfers(transfers);
}

async function getPendingTransfersForSender(senderId) {
  const transfers = await db.all(`
    SELECT * FROM transfers
    WHERE sender_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `, [senderId]);
  return enrichTransfers(transfers);
}

async function getTransferById(transferId) {
  const transfer = await db.get(`
    SELECT * FROM transfers WHERE id = ?
  `, [transferId]);
  return enrichTransfers(transfer);
}

async function cancelTransfer(transferId, senderId) {
  return db.run(`
    UPDATE transfers SET status = 'cancelled'
    WHERE id = ? AND sender_id = ? AND status = 'pending'
  `, [transferId, senderId]);
}

async function completeTransfer(transferId, recipientId, recipientName, amount, slipUrl, selectedItemIds = null) {
  const transfer = await getTransferById(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status !== 'pending') throw new Error('Transfer is not pending');

  const allItemIds = JSON.parse(transfer.item_ids || '[]');
  const finalItemIds = selectedItemIds && selectedItemIds.length > 0 ? selectedItemIds : allItemIds;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update transfer status
    await client.query(
      `UPDATE transfers SET status = 'completed' WHERE id = $1`,
      [transferId]
    );

    // 2. Transfer selected reservations in transaction
    for (const itemId of finalItemIds) {
      const res = await client.query(
        'SELECT id FROM reservations WHERE round_id = $1 AND item_id = $2',
        [transfer.round_id, itemId]
      );

      if (res.rows.length === 0) {
        throw new Error(`Reservation not found for item ${itemId}`);
      }

      await client.query(
        `UPDATE reservations 
         SET transferred_to_id = $1, transferred_to_name = $2, reserved_at = CURRENT_TIMESTAMP
         WHERE round_id = $3 AND item_id = $4`,
        [recipientId, recipientName, transfer.round_id, itemId]
      );
    }

    // 3. Construct names of items for logging
    const itemNamesList = [];
    for (const item of transfer.items) {
      if (finalItemIds.includes(item.id)) {
        itemNamesList.push(`[${item.page_name}] ${item.item_type} #${item.position}`);
      }
    }
    const itemNamesStr = itemNamesList.join(', ');

    // 4. Log the completed transfer
    await client.query(
      `INSERT INTO transfer_logs (
        round_id, sender_id, sender_name, recipient_id, recipient_name,
        item_names, amount, slip_url, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        transfer.round_id,
        transfer.sender_id,
        transfer.sender_name,
        recipientId,
        recipientName,
        itemNamesStr,
        amount,
        slipUrl
      ]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getTransferHistoryForUser(userId) {
  return db.all(`
    SELECT * FROM transfer_logs
    WHERE sender_id = ? OR recipient_id = ?
    ORDER BY completed_at DESC
  `, [userId, userId]);
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
  getAllWhitelist, isWhitelisted, addToWhitelist, removeFromWhitelist, toggleWhitelistStatus, bulkUpdateWhitelistStatus, setOnlyWhitelistActive, resetAllWhitelistStandby, recordLotteryResults, getMemberLotteryHistory, getWhitelistMemberById, updateWhitelistUsername, updateUserReservationsUsername,
  getAdminByDiscordId, getAllAdmins, addAdmin, removeAdmin,



  getAvailableItems, getMyReservations,
  getAllPresets, getPresetById, addPreset, updatePreset, deletePreset,
  getAllParties, addParty, updatePartyName, getPartyMembers, addMemberToParty, removeMemberFromParty, getPartyByDiscordUserId, addWheelEntry, getLatestWheelEntries, deleteWheelEntriesByParty,
  getAllBoardData,
  updateRoundQuota,
  autoAssignWhitelist,
  getUserDashboard,
  saveUserDashboard,
  getUserPreference,
  saveUserLanguage,
  getAllWhitelistWithParty,
  saveUserJob,
  updateWhitelistJob,
  getJobChangeLogs,

  createTransfer,
  getPendingTransfersForRecipient,
  getPendingTransfersForSender,
  getTransferById,
  cancelTransfer,
  completeTransfer,
  getTransferHistoryForUser,
  getWhitelistMemberByDiscordId,
};
