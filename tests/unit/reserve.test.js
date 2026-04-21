// Mock the database queries
jest.mock('../../src/db/queries', () => ({
  isWhitelisted: jest.fn(),
  getAllPages: jest.fn(),
  getItemsForPage: jest.fn(),
  getOrCreateCurrentRound: jest.fn(),
  addReservation: jest.fn()
}));

const db = require('../../src/db/queries');
const reserveCmd = require('../../src/bot/commands/reserve');

describe('/reserve command', () => {
  let interaction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock interaction
    interaction = {
      user: { id: '123', username: 'testuser' },
      options: {
        getInteger: jest.fn((name) => {
          if (name === 'page') return 1;
          if (name === 'item') return null;
          return null;
        })
      },
      reply: jest.fn()
    };
    
    db.getOrCreateCurrentRound.mockReturnValue({ id: 1, name: 'Round 1' });
  });

  test('should reject non-whitelisted users', async () => {
    db.isWhitelisted.mockReturnValue(false);

    await reserveCmd.execute(interaction);

    expect(db.isWhitelisted).toHaveBeenCalledWith('testuser');
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('คุณไม่มีสิทธิ์จอง'),
      ephemeral: true
    }));
  });

  test('should reject booking whole page if it contains สมุดการ์ด', async () => {
    db.isWhitelisted.mockReturnValue(true);
    db.getAllPages.mockReturnValue([{ id: 1, name: '1' }]);
    db.getItemsForPage.mockReturnValue([
      { id: 1, page_id: 1, name: 'Book', item_type: 'สมุดการ์ด', position: 1, reserved_by: null }
    ]);

    await reserveCmd.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('หน้านี้มีสมุดการ์ด'),
      ephemeral: true
    }));
  });

  test('should allow booking whole page if unreserved available', async () => {
    db.isWhitelisted.mockReturnValue(true);
    db.getAllPages.mockReturnValue([{ id: 1, name: '1' }]);
    db.getItemsForPage.mockReturnValue([
      { id: 1, page_id: 1, name: 'Feather', item_type: 'ขนนกขาว', position: 1, reserved_by: null }
    ]);

    await reserveCmd.execute(interaction);

    expect(db.addReservation).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('✅ ยกหน้าสำเร็จ')
    }));
  });
});
