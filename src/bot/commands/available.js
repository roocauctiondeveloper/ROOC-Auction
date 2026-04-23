const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../../db/queries');
const { updateLiveBoard } = require('../liveboard');
const { ICONS, ITEM_TYPES, BRANDING, TYPE_ORDER } = require('../../utils/constants');

// Button custom ID prefixes
const BTN_FEATHER_PREFIX = 'avail_f:'; // avail_f:<pageId>
const BTN_BOOK_PREFIX = 'avail_b:'; // avail_b:<itemId>

// Dropdown fallback IDs (ใช้เมื่อ buttons เกิน 25)
const SELECT_FEATHER_PAGE_ID = 'avail_feather_page';
const SELECT_BOOK_ITEM_ID = 'avail_book_item';

const FEATHER_TYPES = ['Light-Dark', 'Time-Space', 'light-dark', 'time-space'];
const { resolveEmoji } = require('../utils/emoji');

const getEmoji = (t, guild = null) => {
  const entry = ITEM_TYPES[t];
  return resolveEmoji(entry?.emoji, guild, ICONS.DEFAULT || '❓');
};
const disp = (t, guild = null) => {
  const entry = ITEM_TYPES[t];
  if (!entry) return t;
  // สำหรับชื่อข้อความ เราอาจจะไม่ต้องใส่รูปใหญ่โตเอาแค่ชื่อ หรือใส่นำหน้าก็ได้
  return entry.label || t;
};


/** แยก available items ตาม type และเรียงลำดับ */
function splitByType(availableItems) {
  // เรียงตาม TYPE_ORDER ก่อนแยก
  const sorted = [...availableItems].sort(
    (a, b) => (TYPE_ORDER[a.item_type] ?? 9) - (TYPE_ORDER[b.item_type] ?? 9)
  );

  const featherPages = new Map(); // pageId → { page_name, items[] }
  const bookItems = [];

  for (const item of sorted) {
    if (FEATHER_TYPES.includes(item.item_type)) {
      if (!featherPages.has(item.page_id)) {
        featherPages.set(item.page_id, { page_name: item.page_name, items: [] });
      }
      featherPages.get(item.page_id).items.push(item);
    } else {
      bookItems.push(item);
    }
  }
  return { featherPages, bookItems };
}

/** สร้าง Embed — Album ขึ้นก่อน ตามด้วย Light-Dark, Time-Space */
function buildEmbed(featherPages, bookItems, roundName, guild = null) {
  const embed = new EmbedBuilder()
    .setTitle('📋 รายการที่ว่างอยู่')
    .setColor(0x57F287)
    .setFooter({ text: `Round: ${roundName} • /mystuff to view yours` })
    .setTimestamp();

  if (featherPages.size === 0 && bookItems.length === 0) {
    embed.setDescription('ไม่มีรายการที่ว่างในขณะนี้ 🎉');
    return embed;
  }

  // Album ขึ้นก่อน
  if (bookItems.length > 0) {
    const albumEmoji = resolveEmoji(ICONS.ALBUM, guild, '📒');
    embed.addFields({
      name: `${albumEmoji} Album`,
      value: `มีรายการว่าง ${bookItems.length} รายการ`,
    });
  }

  if (featherPages.size > 0) {
    embed.addFields({
      name: `${ICONS.FEATHER || '🪶'} Feather`,
      value: `มีหน้าว่าง ${featherPages.size} หน้า`,
    });
  }
  return embed;
}

/**
 * สร้าง ActionRows จาก buttons โดยแบ่งเป็น bundles (ข้อความละ 5 แถว)
 */
function buildButtonBundles(featherPages, bookItems, guild = null) {
  const bundles = [];
  const allButtons = [];

  // Album
  for (const item of bookItems) {
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${BTN_BOOK_PREFIX}${item.id}`)
        .setLabel(`${item.page_name} #${item.position}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(resolveEmoji(ICONS.ALBUM, guild, '📒'))
    );
  }

  // Feather
  const sortedFeatherEntries = [...featherPages.entries()].sort((a, b) => {
    const aHasLight = a[1].items.some(i => i.item_type === 'light-dark');
    const bHasLight = b[1].items.some(i => i.item_type === 'light-dark');
    if (aHasLight && !bHasLight) return -1;
    if (!aHasLight && bHasLight) return 1;
    return 0;
  });

  for (const [pageId, { page_name, items }] of sortedFeatherEntries) {
    const types = [...new Set(items.map(i => i.item_type))]
      .sort((a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9));

    const hasLD = types.some(t => t.toLowerCase() === 'light-dark');
    const hasTS = types.some(t => t.toLowerCase() === 'time-space');
    const combinedEmoji = (hasLD && hasTS) ? '🤍❤️' : (hasTS ? '❤️' : '🤍');
    const btnStyle = hasLD ? ButtonStyle.Success : ButtonStyle.Secondary;

    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${BTN_FEATHER_PREFIX}${pageId}`)
        .setLabel(`${combinedEmoji} หน้า ${page_name}`)
        .setStyle(btnStyle)
    );
  }

  let currentRows = [];
  for (let i = 0; i < allButtons.length; i += 5) {
    const chunk = allButtons.slice(i, i + 5);
    currentRows.push(new ActionRowBuilder().addComponents(chunk));

    if (currentRows.length === 5) {
      bundles.push(currentRows);
      currentRows = [];
    }
  }
  if (currentRows.length > 0) bundles.push(currentRows);
  
  return bundles;
}

/** ตรวจสอบความพร้อมของรอบ */
async function checkEligibility(interaction) {
  const round = await db.getOrCreateCurrentRound();
  if (round.status !== 'open') {
    return { ok: false, msg: '❌ ขณะนี้ยังไม่ได้เปิดรับจอง หรือปิดรับจองไปแล้วครับ' };
  }
  return { ok: true, round };
}

// ── Reserve helpers ──────────────────────────────────────────────

async function reserveFeatherPage(interaction, pageId) {
  await interaction.deferReply({ ephemeral: true });
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member?.displayName ?? interaction.user.username;

  const check = await checkEligibility(interaction);
  if (!check.ok) return interaction.editReply({ content: check.msg });
  const { round } = check;

  const myReservations = await db.getMyReservations(discordUserId, round.id);
  if (myReservations.length > 0) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองเก่า').setStyle(ButtonStyle.Danger)
    );
    const current = myReservations.map(r => `• **หน้า ${r.page_name}** ชิ้นที่ ${r.position} (${r.item_type})`).join('\n');
    return interaction.editReply({
      content: `❌ **${discordUsername}** คุณได้จองไปแล้วในรอบนี้ (คนละ 1 สิทธิ์)\n\n**รายการที่คุณจองไว้:**\n${current}\n\n💡 หากต้องการเปลี่ยนรายการ กรุณายกเลิกของเก่าด้วยปุ่มด้านล่าง หรือพิมพ์ \`/unreserve\``,
      components: [row]
    });
  }

  const allItems = await db.getItemsForPage(pageId);
  const available = allItems.filter(i => FEATHER_TYPES.includes(i.item_type) && !i.reserved_by);

  if (available.length === 0) {
    return interaction.editReply({ content: '❌ หน้านี้ถูกจองแล้ว' });
  }

  const success = [];
  for (const item of available) {
    try {
      await db.addReservation(round.id, item.id, discordUserId, discordUsername);
      success.push(`ชิ้นที่ ${item.position} (${disp(item.item_type)})`);
    } catch { }
  }

  if (success.length === 0) {
    return interaction.editReply({ content: '❌ หน้านี้ถูกจองแล้ว' });
  }

  await updateLiveBoard(interaction.client, round.id);

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองนี้').setStyle(ButtonStyle.Danger)
  );

  const devRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
      .setURL(BRANDING.URL)
      .setStyle(ButtonStyle.Link)
  );

  return interaction.editReply({ content: `✅ จองสำเร็จ! คุณสามารถยกเลิกได้หากเปลี่ยนใจ:`, components: [row, devRow] });
}


async function reserveBookItem(interaction, itemId) {
  await interaction.deferReply({ ephemeral: true });
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member?.displayName ?? interaction.user.username;

  const check = await checkEligibility(interaction);
  if (!check.ok) return interaction.editReply({ content: check.msg });
  const { round } = check;

  const myReservations = await db.getMyReservations(discordUserId, round.id);
  if (myReservations.length > 0) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองเก่า').setStyle(ButtonStyle.Danger)
    );
    const current = myReservations.map(r => `• **หน้า ${r.page_name}** ชิ้นที่ ${r.position} (${r.item_type})`).join('\n');
    return interaction.editReply({
      content: `❌ **${discordUsername}** คุณได้จองไปแล้วในรอบนี้ (คนละ 1 สิทธิ์)\n\n**รายการที่คุณจองไว้:**\n${current}\n\n💡 หากต้องการเปลี่ยนรายการ กรุณายกเลิกของเก่าด้วยปุ่มด้านล่าง หรือพิมพ์ \`/unreserve\``,
      components: [row]
    });
  }

  const ok = await db.isWhitelisted(discordUserId);
  if (!ok) {
    return interaction.editReply({
      content: `❌ **${discordUsername}** ไม่สามารถจอง Album ได้ (ต้องอยู่ใน Whitelist)\n\nหน้า Feather (Light-Dark / Time-Space) สามารถจองได้ปกติครับ`
    });
  }

  const isReserved = await db.isItemReserved(round.id, itemId);
  if (isReserved) {
    return interaction.editReply({ content: '❌ Album ชิ้นนี้ถูกจองแล้ว' });
  }

  try {
    await db.addReservation(round.id, itemId, discordUserId, discordUsername);
    await updateLiveBoard(interaction.client, round.id);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('unreserve_me').setLabel('❌ ยกเลิกการจองนี้').setStyle(ButtonStyle.Danger)
    );

    const devRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
        .setURL(BRANDING.URL)
        .setStyle(ButtonStyle.Link)
    );

    return interaction.editReply({ content: `✅ จองสำเร็จ! คุณสามารถยกเลิกได้หากเปลี่ยนใจ:`, components: [row, devRow] });
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.code === '23505') {
      return interaction.editReply({ content: '❌ Album ชิ้นนี้ถูกจองแล้ว' });
    }
    console.error('[available] reserveBookItem error:', err);
    return interaction.editReply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
}

// ── Module exports ───────────────────────────────────────────────

module.exports = {
  /** Router สำหรับ button interactions — เรียกจาก client.js */
  async handleButton(interaction) {
    const id = interaction.customId;
    const { LB_FEATHER_PREFIX, LB_BOOK_PREFIX } = require('../liveboard');

    if (id.startsWith(BTN_FEATHER_PREFIX) || id.startsWith(LB_FEATHER_PREFIX)) {
      const prefix = id.startsWith(BTN_FEATHER_PREFIX) ? BTN_FEATHER_PREFIX : LB_FEATHER_PREFIX;
      const pageId = parseInt(id.slice(prefix.length));
      return await reserveFeatherPage(interaction, pageId);
    }
    if (id.startsWith(BTN_BOOK_PREFIX) || id.startsWith(LB_BOOK_PREFIX)) {
      const prefix = id.startsWith(BTN_BOOK_PREFIX) ? BTN_BOOK_PREFIX : LB_BOOK_PREFIX;
      const itemId = parseInt(id.slice(prefix.length));
      return await reserveBookItem(interaction, itemId);
    }
  },

  /** Router สำหรับ dropdown fallback — เรียกจาก client.js */
  async handleSelect(interaction) {
    if (interaction.customId === SELECT_FEATHER_PAGE_ID) {
      return await reserveFeatherPage(interaction, parseInt(interaction.values[0]));
    }
    if (interaction.customId === SELECT_BOOK_ITEM_ID) {
      return await reserveBookItem(interaction, parseInt(interaction.values[0]));
    }
    // สำหรับ Dropdown เพิ่มเติมจาก Live Board
    if (interaction.customId === 'lb_more_items') {
      const [type, id] = interaction.values[0].split(':');
      if (type === 'feather') return await reserveFeatherPage(interaction, parseInt(id));
      if (type === 'book') return await reserveBookItem(interaction, parseInt(id));
    }
    // Dropdown สมุดแบบกะทัดรัด (> 5 ชิ้น)
    if (interaction.customId.startsWith('lb_album_menu_')) {
      return await reserveBookItem(interaction, parseInt(interaction.values[0]));
    }
    if (interaction.customId.startsWith('lb_ld_menu_') || interaction.customId.startsWith('lb_ts_menu_')) {
      return await reserveFeatherPage(interaction, parseInt(interaction.values[0]));
    }
  },


  BTN_FEATHER_PREFIX,
  BTN_BOOK_PREFIX,
  SELECT_FEATHER_PAGE_ID,
  SELECT_BOOK_ITEM_ID,
};
