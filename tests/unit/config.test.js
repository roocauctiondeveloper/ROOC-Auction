const config = require('../../src/config');

describe('Config Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should throw error when missing environment variables (Property 25)', () => {
    delete process.env.DISCORD_TOKEN;
    
    expect(() => {
      config.validateConfig();
    }).toThrow('Missing required environment variables: DISCORD_TOKEN');
  });

  test('should pass validation when all required variables are present', () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_CLIENT_ID = 'client_id';
    process.env.DISCORD_GUILD_ID = 'guild_id';
    process.env.PORT = '3000';
    process.env.SESSION_SECRET = 'secret';

    expect(() => {
      config.validateConfig();
    }).not.toThrow();
  });
});
