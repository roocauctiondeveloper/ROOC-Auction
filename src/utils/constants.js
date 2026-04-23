/**
 * Global Icons & Constants
 * แก้ไขที่นี่ที่เดียวเพื่อเปลี่ยนไอคอนทั้งระบบ (ทั้งบอทและเว็บ)
 */
module.exports = {
  ICONS: {
    ALBUM: '📒',
    LIGHT_DARK: '🤍', 
    TIME_SPACE: '❤️',
    PAGE: '📄',
    WHITELIST: '🛡️',
    HISTORY: '🕰️',
    RESERVATION: '🎒',
    FEATHER: '🪶',
    DEFAULT: '❓',
    ERROR: '❌',
    SUCCESS: '✅',
    PENDING: '🌀',
    WINNER: '🏆',
  },
  
  // Mapping สำหรับแสดงผลสินค้า
  ITEM_TYPES: {
    'Album': { label: 'Album', emoji: '📒' },
    'Light-Dark': { label: 'Light-Dark', emoji: '🤍' },
    'Time-Space': { label: 'Time-Space', emoji: '❤️' },
    'light-dark': { label: 'Light-Dark', emoji: '🤍' },
    'time-space': { label: 'Time-Space', emoji: '❤️' },
  },

  // ลำดับการเรียงประเภทสินค้า
  TYPE_ORDER: {
    'light-dark': 1,
    'Light-Dark': 1,
    'time-space': 2,
    'Time-Space': 2,
    'album': 3,
    'Album': 3,
  },

  BRANDING: {
    DEVELOPER: 'GadzillaChannel',
    TEXT: 'Developed by GadzillaChannel',
    URL: 'https://www.youtube.com/@GadzillaChannel',
    EMOJI: '▶️',
  }
};
