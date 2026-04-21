const { ICONS } = require('../../utils/constants');

/**
 * ฟังก์ชันสำหรับแปลงไอคอน (รองรับทั้ง Emoji ปกติ และ Custom Emoji จากชื่อ)
 * @param {string} emojiString ข้อความไอคอนจาก Constants (เช่น '🤍' หรือ 'custom:Lightanddarkbox')
 * @param {Guild} guild วัตถุ Guild ของ Discord เพื่อใช้ค้นหา Custom Emoji
 * @param {string} fallback ไอคอนสำรองกรณีหาไม่เจอ
 */
function resolveEmoji(emojiString, guild = null, fallback = '❓') {
  if (!emojiString) return fallback;

  // ถ้าเป็น Custom Emoji (รูปแบบ custom:name)
  if (emojiString.startsWith('custom:')) {
    const emojiName = emojiString.split(':')[1];
    if (guild) {
      const customEmoji = guild.emojis.cache.find(e => e.name === emojiName);
      if (customEmoji) {
        return customEmoji.toString();
      }
    }
    
    // ถ้าหาไม่เจอ หรือไม่มี Guild ให้ส่งค่า Default ตามประเภท
    if (emojiName === 'book~1') return '📒';
    if (emojiName === 'Lightanddarkbox') return '🤍';
    if (emojiName === 'timeandspacebox') return '❤️';
    return fallback;
  }

  // ถ้าเป็น Emoji ปกติ ให้ส่งกลับไปเลย
  return emojiString;
}

module.exports = { resolveEmoji };
