/**
 * Global Icons & Constants
 * แก้ไขที่นี่ที่เดียวเพื่อเปลี่ยนไอคอนทั้งระบบ (ทั้งบอทและเว็บ)
 */
module.exports = {
  ICONS: {
    ALBUM: '📒',
    ILLUTION_BOX: '🧩',
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
    'Illution Box': { label: 'Illution Box', emoji: '🧩' },
    'Light-Dark': { label: 'Light-Dark', emoji: '🤍' },
    'Time-Space': { label: 'Time-Space', emoji: '❤️' },
    'ขนนกดำ': { label: 'Light-Dark', emoji: '🤍' },
    'ขนนกขาว': { label: 'Time-Space', emoji: '❤️' },
    'สมุดการ์ด': { label: 'Album', emoji: '📒' },
    'light-dark': { label: 'Light-Dark', emoji: '🤍' },
    'time-space': { label: 'Time-Space', emoji: '❤️' },
    'illution-box': { label: 'Illution Box', emoji: '🧩' },
  },

  FEATHER_TYPES: ['Light-Dark', 'Time-Space', 'light-dark', 'time-space'],

  // ลำดับการเรียงประเภทสินค้า
  TYPE_ORDER: {
    'album': 1,
    'Album': 1,
    'illution-box': 2,
    'Illution Box': 2,
    'light-dark': 3,
    'Light-Dark': 3,
    'time-space': 4,
    'Time-Space': 4,
  },

  BRANDING: {
    DEVELOPER: 'GadzillaChannel',
    TEXT: 'Developed by GadzillaChannel',
    URL: 'https://www.youtube.com/@GadzillaChannel',
    EMOJI: '▶️',
  }
};
