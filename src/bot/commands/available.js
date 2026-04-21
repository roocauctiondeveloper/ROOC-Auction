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

// Button custom ID prefixes
const BTN_FEATHER_PREFIX = 'avail_f:'; // avail_f:<pageId>
const BTN_BOOK_PREFIX    = 'avail_b:'; // avail_b:<itemId>

// Dropdown fallback IDs (ใช้เมื่อ buttons เกิน 25)
const SELECT_FEATHER_PAGE_ID = 'avail_feather_page';
const SELECT_BOOK_ITEM_ID    = 'avail_book_item';

const FEATHER_TYPES = ['light-dark', 'time-space'];
const FEATHER_EMOJI = { 'light-dark': '🤍', 'time-space': '❤️' };

// ลำดับการแสดงผล: Album → light-dark → time-space (DB values)
const TYPE_ORDER = { 'Album': 0, 'light-dark': 1, 'time-space': 2 };

// Display names สำหรับแสดงใน Discord
const DISP = { 'Album': 'Album', 'light-dark': 'Light-Dark', 'time-space': 'Time-Space' };
const disp = (t) => DISP[t] ?? t;

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
function buildEmbed(featherPages, bookItems, roundName) {
  const embed = new EmbedBuilder()
    .setTitle('📋 รายการที่ว่างอยู่')
    .setColor(0x57F287)
    .setFooter({ text: `รอบ: ${roundName} • /mystuff เพื่อดูของที่จองไว้` })
    .setTimestamp();

  if (featherPages.size === 0 && bookItems.length === 0) {
    embed.setDescription('ไม่มีรายการที่ว่างในขณะนี้ 🎉');
    return embed;
  }

  // Album ขึ้นก่อน
  if (bookItems.length > 0) {
    const lines = bookItems.map(i => `📒 **${i.page_name}** ชิ้นที่ ${i.position}`);
    embed.addFields({
      name: '📒 Album — กดปุ่มชิ้นที่ต้องการ',
      value: lines.join('\n'),
      inline: false,
    });
  }

  // Light-Dark ก่อน Time-Space ทีหลัง
  if (featherPages.size > 0) {
    const lines = [];
    for (const [, { page_name, items }] of featherPages) {
      const types = [...new Set(items.map(i => i.item_type))]
        .sort((a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9));
      const emojis = types.map(t => FEATHER_EMOJI[t] || '🪶').join('');
      lines.push(`${emojis} **${page_name}** — ${types.map(disp).join(', ')} (${items.length} ชิ้น)`);
    }
    embed.addFields({
      name: '🪶 Feather — กดปุ่มหน้าเพื่อจองทั้งหน้า',
      value: lines.join('\n'),
      inline: false,
    });
  }

  return embed;
}

/**
 * สร้าง ActionRows จาก buttons
 * Discord limit: 5 rows × 5 buttons = 25 buttons max
 * ถ้าเกิน 25 → fallback dropdown
 */
function buildButtonRows(featherPages, bookItems) {
  const totalButtons = featherPages.size + bookItems.length;

  if (totalButtons > 25) {
    return buildDropdownFallback(featherPages, bookItems);
  }

  const allButtons = [];

  // Album ขึ้นก่อน (สีน้ำเงิน)
  for (const item of bookItems) {
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${BTN_BOOK_PREFIX}${item.id}`)
        .setLabel(`${item.page_name} #${item.position}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📒')
    );
  }

  // Light-Dark ก่อน Time-Space ทีหลัง (สีเขียว)
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
    const emoji = types.length === 1 ? (FEATHER_EMOJI[types[0]] || '🪶') : '🪶';
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${BTN_FEATHER_PREFIX}${pageId}`)
        .setLabel(page_name)
        .setStyle(ButtonStyle.Success)
        .setEmoji(emoji)
    );
  }

  const rows = [];
  for (let i = 0; i < allButtons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(allButtons.slice(i, i + 5)));
  }
  return rows;
}

/** Fallback: dropdown เมื่อ buttons เกิน 25 */
function buildDropdownFallback(featherPages, bookItems) {
  const rows = [];

  if (featherPages.size > 0) {
    const options = [...featherPages.entries()].slice(0, 25).map(([pageId, { page_name, items }]) => {
      const types = [...new Set(items.map(i => i.item_type))].map(disp).join(', ');
      return new StringSelectMenuOptionBuilder()
        .setLabel(page_name)
        .setDescription(`${types} — ${items.length} ชิ้นว่าง`)
        .setValue(`${pageId}`)
        .setEmoji('🪶');
    });
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(SELECT_FEATHER_PAGE_ID)
        .setPlaceholder('🪶 เลือกหน้า Feather...')
        .addOptions(options)
    ));
  }

  if (bookItems.length > 0) {
    const options = bookItems.slice(0, 25).map(item =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${item.page_name} — ชิ้นที่ ${item.position}`)
        .setDescription('Album')
        .setValue(`${item.id}`)
        .setEmoji('📒')
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(SELECT_BOOK_ITEM_ID)
        .setPlaceholder('📒 เลือก Album...')
        .addOptions(options)
    ));
  }

  return rows;
}

/** ตรวจสอบ whitelist + round */
async function checkEligibility(interaction) {
  const isWhitelisted = await db.isWhitelisted(interaction.user.id);
  if (!isWhitelisted) {
    return { ok: false, msg: '❌ คุณไม่มีสิทธิ์จอง (ยังไม่ได้อยู่ใน Whitelist)' };
  }
  const round = await db.getOrCreateCurrentRound();
  if (round.status !== 'open') {
    return { ok: false, msg: '❌ ปิดรับจองไปแล้วครับ' };
  }
  return { ok: true, round };
}

// ── Reserve helpers ──────────────────────────────────────────────

async function reserveFeatherPage(interaction, pageId) {
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member?.displayName ?? interaction.user.username;

  const check = await checkEligibility(interaction);
  if (!check.ok) return interaction.reply({ content: check.msg, ephemeral: true });
  const { round } = check;

  const allItems = await db.getItemsForPage(pageId);
  const available = allItems.filter(i => FEATHER_TYPES.includes(i.item_type) && !i.reserved_by);

  if (available.length === 0) {
    return interaction.reply({ content: '❌ หน้านี้ถูกจองหมดแล้ว', ephemeral: true });
  }

  const pages = await db.getAllPages();
  const pageName = pages.find(p => p.id === pageId)?.name ?? `Page #${pageId}`;
  const success = [], fail = [];

  for (const item of available) {
    try {
      await db.addReservation(round.id, item.id, discordUserId, discordUsername);
      success.push(`ชิ้นที่ ${item.position} (${disp(item.item_type)})`);
    } catch { fail.push(`ชิ้นที่ ${item.position}`); }
  }

  if (success.length === 0) {
    return interaction.reply({ content: '❌ ทุกชิ้นถูกจองไปแล้ว', ephemeral: true });
  }

  // 📢 Update Live Board
  await updateLiveBoard(interaction.client, round.id);

  let msg = `✅ **${discordUsername}** จองหน้า **${pageName}** สำเร็จ!\n📦 ${success.join(', ')}`;
  if (fail.length > 0) msg += `\n⚠️ จองไม่ได้ (ถูกจองไปแล้ว): ${fail.join(', ')}`;
  msg += '\n\n💡 ดูของที่จองไว้ทั้งหมดด้วย `/mystuff`';
  return interaction.reply({ content: msg, ephemeral: false });
}

async function reserveBookItem(interaction, itemId) {
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member?.displayName ?? interaction.user.username;

  const check = await checkEligibility(interaction);
  if (!check.ok) return interaction.reply({ content: check.msg, ephemeral: true });
  const { round } = check;

  const isReserved = await db.isItemReserved(round.id, itemId);
  if (isReserved) {
    return interaction.reply({ content: '❌ Album ชิ้นนี้ถูกจองไปแล้ว', ephemeral: true });
  }

  const item = await db.getItemById(itemId);
  if (!item) return interaction.reply({ content: '❌ ไม่พบ Item ที่เลือก', ephemeral: true });

  const pages = await db.getAllPages();
  const pageName = pages.find(p => p.id === item.page_id)?.name ?? `Page #${item.page_id}`;

  try {
    await db.addReservation(round.id, itemId, discordUserId, discordUsername);

    // 📢 Update Live Board
    await updateLiveBoard(interaction.client, round.id);

    return interaction.reply({
      content: `✅ **${discordUsername}** จองสำเร็จ!\n📒 ${disp(item.item_type)} **${pageName}** ชิ้นที่ ${item.position}\n\n💡 ดูของที่จองไว้ทั้งหมดด้วย \`/mystuff\``,
      ephemeral: false,
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.code === '23505') {
      return interaction.reply({ content: '❌ Album ชิ้นนี้ถูกจองไปแล้ว', ephemeral: true });
    }
    console.error('[available] reserveBookItem error:', err);
    return interaction.reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
  }
}

// ── Module exports ───────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('available')
    .setDescription('ดูรายการที่ว่างอยู่ และจองได้เลย'),

  async execute(interaction) {
    const currentRound = await db.getOrCreateCurrentRound();
    if (currentRound.status !== 'open') {
      return interaction.reply({
        content: '❌ ขณะนี้ยังไม่ได้เปิดรับจอง หรือปิดรับจองไปแล้วครับ',
        ephemeral: true,
      });
    }

    const availableItems = await db.getAvailableItems(currentRound.id);
    const { featherPages, bookItems } = splitByType(availableItems);
    const embed = buildEmbed(featherPages, bookItems, currentRound.name);

    if (featherPages.size === 0 && bookItems.length === 0) {
      // ไม่มีของว่าง — ephemeral เพราะไม่ต้องให้คนอื่นเห็น
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const components = buildButtonRows(featherPages, bookItems);
    // ephemeral: true — เฉพาะคนใช้คำสั่งเห็น embed + ปุ่ม
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },

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
  },

  BTN_FEATHER_PREFIX,
  BTN_BOOK_PREFIX,
  SELECT_FEATHER_PAGE_ID,
  SELECT_BOOK_ITEM_ID,
};
