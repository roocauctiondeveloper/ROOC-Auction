const { translate } = require('../../src/bot/i18n');

describe('Race condition translation messages', () => {
  test('Thai race message with winner mention', () => {
    const msg = translate('th', 'race', { winner: '<@123456789>' });
    expect(msg).toBe('💘 คุณใจตรงกันกับ <@123456789>! (เขากดจองตัดหน้าสำเร็จไปก่อนแป๊บเดียวเอง 😉)');
  });

  test('Thai race message without winner', () => {
    const msg = translate('th', 'race');
    expect(msg).toBe('💘 คุณใจตรงกันกับคนที่จองสำเร็จ! (เขากดจองตัดหน้าสำเร็จไปก่อนแป๊บเดียวเอง 😉)');
  });

  test('English race message with winner', () => {
    const msg = translate('en', 'race', { winner: '<@123456789>' });
    expect(msg).toBe('💘 Great minds think alike! You matched with <@123456789>, but they beat you to it! 😉');
  });

  test('English race message without winner', () => {
    const msg = translate('en', 'race');
    expect(msg).toBe('💘 Great minds think alike! Someone beat you to this reservation by a split second! 😉');
  });

  test('Indonesian race message with winner', () => {
    const msg = translate('id', 'race', { winner: '<@123456789>' });
    expect(msg).toBe('💘 Sehati banget! Anda sama dengan <@123456789>, tapi dia berhasil memesan duluan! 😉');
  });

  test('Tagalog race message with winner', () => {
    const msg = translate('tl', 'race', { winner: '<@123456789>' });
    expect(msg).toBe('💘 Magkapareho kayo ng isip ni <@123456789>! Kaso nakuha na niya nang mas mabilis 😉');
  });

  test('Chinese race message with winner', () => {
    const msg = translate('zh', 'race', { winner: '<@123456789>' });
    expect(msg).toBe('💘 心有灵犀！您与 <@123456789> 想到一块去了，可惜被对方抢先一步 😉');
  });
});
