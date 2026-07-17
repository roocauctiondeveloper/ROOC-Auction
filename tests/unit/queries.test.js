const createMockDb = require('../mock-db');

let mockActiveDb;
jest.mock('../../src/db/database', () => ({
  all: (...args) => mockActiveDb.all(...args),
  get: (...args) => mockActiveDb.get(...args),
  run: (...args) => mockActiveDb.run(...args),
  exec: (...args) => mockActiveDb.exec(...args),
  pool: {
    query: (...args) => mockActiveDb.pool.query(...args),
    connect: (...args) => mockActiveDb.pool.connect(...args)
  }
}));

describe('Database Queries', () => {
  let queries;

  beforeEach(() => {
    mockActiveDb = createMockDb();
    mockActiveDb.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_user_id TEXT NOT NULL UNIQUE,
          created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS items (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          item_type  TEXT NOT NULL CHECK (item_type IN ('Album', 'Illution Box', 'Light-Dark', 'Time-Space')),
          position   INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (page_id, position)
      );
      CREATE TABLE IF NOT EXISTS rounds (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          status     TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'open', 'closed')),
          quota      INTEGER DEFAULT 1,
          quota_ld   INTEGER DEFAULT 1,
          quota_ts   INTEGER DEFAULT 1,
          board_channel_id TEXT,
          board_message_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS reservations (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
          item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          discord_user_id  TEXT NOT NULL,
          discord_username TEXT NOT NULL,
          reserved_at      TEXT NOT NULL DEFAULT (datetime('now')),
          transferred_from_name TEXT,
          transferred_to_id TEXT,
          transferred_to_name TEXT,
          UNIQUE (round_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS whitelist (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_username TEXT NOT NULL,
          discord_user_id  TEXT NOT NULL UNIQUE,
          is_active        BOOLEAN DEFAULT 1,
          win_count        INTEGER DEFAULT 0,
          spin_count       INTEGER DEFAULT 0,
          job              TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
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
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS transfer_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id INTEGER NOT NULL,
          sender_id TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          recipient_id TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          item_names TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          slip_url TEXT,
          completed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    jest.resetModules();
    queries = require('../../src/db/queries');
  });

  test('should create and retrieve pages', async () => {
    const pageId = await queries.addPage('Page 1');
    const pages = await queries.getAllPages();
    expect(pages.length).toBe(1);
    expect(pages[0].name).toBe('Page 1');
    expect(pages[0].id).toBe(pageId);
    expect(pages[0].item_count).toBe(0);
  });

  test('should create items and validate types', async () => {
    const pageId = await queries.addPage('Page 1');
    
    // Add valid item
    const itemId = await queries.addItem(pageId, 'Album', 1);
    expect(itemId).toBeDefined();

    // Should fail with invalid item type
    await expect(async () => {
      await queries.addItem(pageId, 'InvalidType', 2);
    }).rejects.toThrow(/CHECK constraint failed/);
  });

  test('should whitelist members properly', async () => {
    const wId = await queries.addToWhitelist('userX', '111222');
    expect(wId).toBeDefined();
    
    expect(await queries.isWhitelisted('111222')).toBe(true);
    expect(await queries.isWhitelisted('unknownUser')).toBe(false);

    const wlMember = await queries.getWhitelistMemberByDiscordId('111222');
    expect(wlMember).toBeDefined();
    expect(wlMember.discord_username).toBe('userX');
    expect(await queries.getWhitelistMemberByDiscordId('unknownUser')).toBeUndefined();

    // UNIQUE constraint check
    await expect(async () => {
      await queries.addToWhitelist('userY', '111222');
    }).rejects.toThrow(/UNIQUE constraint failed/);
  });

  test('should handle item transfers and payment logging', async () => {
    // 1. Setup round, page, item
    const round = await queries.getOrCreateCurrentRound();
    const roundId = round.id;
    const pageId = await queries.addPage('Transfer Page');
    const itemId = await queries.addItem(pageId, 'Light-Dark', 1);
    
    // Add User A reservation
    await queries.addReservation(roundId, itemId, 'sender_id_123', 'SenderUsername');
    
    // Check item is reserved
    const reservedBefore = await queries.isItemReserved(roundId, itemId);
    expect(reservedBefore).toBe(true);

    // 2. Create a transfer request for multiple items
    const transferId = await queries.createTransfer(
      roundId,
      [itemId], // array of itemIds
      'sender_id_123',
      'SenderUsername',
      'recipient_id_456',
      'RecipientUsername',
      'KBank',
      '111-2-22222-2',
      'Sender Account Name',
      null,
      '0812345678',
      'Sender PP Name'
    );
    expect(transferId).toBeDefined();

    // 3. Get pending transfers for recipient
    const pendingTransfers = await queries.getPendingTransfersForRecipient('recipient_id_456');
    expect(pendingTransfers.length).toBe(1);
    expect(pendingTransfers[0].id).toBe(transferId);
    expect(pendingTransfers[0].bank_name).toBe('KBank');
    expect(pendingTransfers[0].promptpay_id).toBe('0812345678');
    expect(pendingTransfers[0].items.length).toBe(1);
    expect(pendingTransfers[0].items[0].id).toBe(itemId);

    // 4. Complete the transfer
    const success = await queries.completeTransfer(
      transferId,
      'recipient_id_456',
      'RecipientUsername',
      150.00,
      'http://discord.cdn/slip.png'
    );
    expect(success).toBe(true);

    // Check reservation transferred state
    const resvs = await queries.getReservationsByRound(roundId);
    const targetResv = resvs.find(r => r.item_id === itemId);
    expect(targetResv).toBeDefined();
    
    const reservation = await queries.getReservationById(targetResv.id);
    expect(reservation.discord_user_id).toBe('sender_id_123'); // Original owner remains
    expect(reservation.discord_username).toBe('SenderUsername');
    expect(reservation.transferred_to_id).toBe('recipient_id_456'); // Transferred recipient overlay set
    expect(reservation.transferred_to_name).toBe('RecipientUsername');

    // Check status of transfer is completed
    const completedTransfer = await queries.getTransferById(transferId);
    expect(completedTransfer.status).toBe('completed');

    // Check history logs
    const history = await queries.getTransferHistoryForUser('recipient_id_456');
    expect(history.length).toBe(1);
    expect(history[0].amount).toBe(150);
    expect(history[0].slip_url).toBe('http://discord.cdn/slip.png');
    expect(history[0].item_names).toContain('Light-Dark');
  });

  test('should correctly group items by page and type in compactSummary', async () => {
    const round = await queries.getOrCreateCurrentRound();
    const roundId = round.id;
    const pageId = await queries.addPage('Page 10');

    // Add items of mixed types on the same page
    const itemId1 = await queries.addItem(pageId, 'Light-Dark', 1);
    const itemId2 = await queries.addItem(pageId, 'Time-Space', 2);
    // Add another Light-Dark item on Page 10 to test position list formatting
    const itemId3 = await queries.addItem(pageId, 'Light-Dark', 3);

    await queries.addReservation(roundId, itemId1, 'sender_x', 'SenderX');
    await queries.addReservation(roundId, itemId2, 'sender_x', 'SenderX');
    await queries.addReservation(roundId, itemId3, 'sender_x', 'SenderX');

    // Only transfer itemId1 (Light-Dark) and itemId2 (Time-Space)
    const transferId = await queries.createTransfer(
      roundId,
      [itemId1, itemId2],
      'sender_x',
      'SenderX',
      'recipient_y',
      'RecipientY',
      null, null, null, null, null, null
    );

    const pending = await queries.getPendingTransfersForRecipient('recipient_y');
    expect(pending.length).toBe(1);
    
    const summary = pending[0].compactSummary;
    // Light-Dark: transferred 1 out of 2 total on this page -> should show positions (#1)
    expect(summary).toContain('🤍 Light-Dark 📄 Page 10 (#1)');
    // Time-Space: transferred 1 out of 1 total on this page -> should show (ทั้งหมด)
    expect(summary).toContain('❤️ Time-Space 📄 Page 10 (ทั้งหมด)');
  });
});
