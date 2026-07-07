jest.mock('../../src/db/queries', () => ({
  saveUserJob: jest.fn()
}));
jest.mock('../../src/bot/i18n', () => ({
  getInteractionLanguage: jest.fn()
}));

const db = require('../../src/db/queries');
const { getInteractionLanguage } = require('../../src/bot/i18n');
const jobCmd = require('../../src/bot/commands/job');

describe('/job command', () => {
  let interaction;

  beforeEach(() => {
    jest.clearAllMocks();

    interaction = {
      user: { id: '123456789012345678', username: 'testuser', globalName: 'TestUser' },
      member: { displayName: 'NicknameInGuild' },
      options: {
        getString: jest.fn(() => 'High Priest')
      },
      reply: jest.fn()
    };
  });

  test('should successfully set job in Thai', async () => {
    getInteractionLanguage.mockResolvedValue('th');
    db.saveUserJob.mockResolvedValue();

    await jobCmd.execute(interaction);

    expect(db.saveUserJob).toHaveBeenCalledWith('123456789012345678', 'NicknameInGuild', 'High Priest');
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('ตั้งค่าอาชีพของคุณเป็น **High Priest** เรียบร้อยแล้ว'),
      ephemeral: true
    }));
  });

  test('should successfully set job in English', async () => {
    getInteractionLanguage.mockResolvedValue('en');
    db.saveUserJob.mockResolvedValue();

    await jobCmd.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('successfully set to **High Priest**'),
      ephemeral: true
    }));
  });

  test('should handle database errors gracefully', async () => {
    getInteractionLanguage.mockResolvedValue('th');
    db.saveUserJob.mockRejectedValue(new Error('DB Error'));

    await jobCmd.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('เกิดข้อผิดพลาดในการบันทึกข้อมูลอาชีพ'),
      ephemeral: true
    }));
  });
});
