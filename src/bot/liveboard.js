/**
 * Live Reservation Board
 * ส่ง embed grid แสดงสถานะ items ทุก page พร้อม buttons จองได้เลย
 * และ edit message นั้นทุกครั้งที่มีการจอง
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../db/queries');
const { ICONS, ITEM_TYPES, BRANDING } = require('../utils/constants');
const { resolveEmoji } = require('./utils/emoji');

// Helper สำหรับหาข้อมูลแบบ Case-insensitive
const getItemData = (t) => {
  if (!t) return null;
  const key = Object.keys(ITEM_TYPES).find(k => k.toLowerCase() === t.toLowerCase());
  return ITEM_TYPES[key];
};

const d = (t) => getItemData(t)?.label || t;
const getEmoji = (t, guild = null) => {
  const entry = getItemData(t);
  return resolveEmoji(entry?.emoji, guild, ICONS.DEFAULT || '❓');
};

const FEATHER_TYPES = ['Light-Dark', 'Time-Space', 'light-dark', 'time-space'];

// Button prefix สำหรับ live board (แยกจาก /available)
const LB_FEATHER_PREFIX = 'lb_f_';
const LB_BOOK_PREFIX = 'lb_b_';

/**
 * แยก Message IDs แบบมีโครงสร้าง
 */
function parseBoardIds(idStr) {
  if (!idStr) return { emb: [], alb: [], ld: [], ts: [], brd: [] };
  if (!idStr.includes('|')) {
    const ids = idStr.split(',');
    if (ids.length < 4) return { emb: ids, alb: [], ld: [], ts: [] };
    const emb = ids.slice(0, ids.length - 3);
    const alb = [ids[ids.length - 3]];
    const ld = [ids[ids.length - 2]];
    const ts = [ids[ids.length - 1]];
    return { emb, alb, ld, ts };
  }
  const parts = idStr.split('|');
  const result = { emb: [], alb: [], ld: [], ts: [] };
  parts.forEach(p => {
    const [key, val] = p.split(':');
    const ids = val ? val.split(',').filter(x => x) : [];
    if (key === 'EMB') result.emb = ids;
    if (key === 'ALB') result.alb = ids;
    if (key === 'LD') result.ld = ids;
    if (key === 'TS') result.ts = ids;
    if (key === 'BRD') result.brd = ids;
  });
  return result;
}

/**
 * สร้าง embeds แสดง grid
 */
async function buildBoardEmbed(round, guild = null) {
  const allData = await db.getAllBoardData(round.id);
  
  if (allData.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 Live Board — ${round.name}`)
      .setColor(0x57F287)
      .setDescription('ยังไม่มีสินค้าในระบบ')
      .setTimestamp();
    return { embeds: [embed], totalItems: 0, reservedCount: 0 };
  }

  const pagesMap = new Map();
  for (const row of allData) {
    if (!pagesMap.has(row.page_id)) {
      pagesMap.set(row.page_id, { name: row.page_name, items: [] });
    }
    pagesMap.get(row.page_id).items.push(row);
  }

  const pages = Array.from(pagesMap.values());
  let totalItems = 0;
  let reservedCount = 0;
  const embeds = [];
  
  for (let i = 0; i < pages.length; i += 24) {
    const pageSlice = pages.slice(i, i + 24);
    const embed = new EmbedBuilder().setColor(0x57F287);
    if (i === 0) embed.setTitle(`📋 Live Board — ${round.name}`);

    for (const page of pageSlice) {
      totalItems += page.items.length;
      const types = [...new Set(page.items.map(i => i.item_type))];
      const pageEmojis = types.map(t => getEmoji(t, guild)).join('');

      const dFormat = (type) => {
        const tInfo = getItemData(type);
        return `${resolveEmoji(tInfo?.emoji, guild, ICONS.DEFAULT)} ${tInfo?.label ?? type}`;
      };

      const lines = page.items.map(i => {
        // 🚨 FIX: เช็คให้ละเอียดทั้งชื่อและ ID
        if (i.reserved_by !== null && i.reserved_by !== undefined && i.reserved_by !== '') {
          reservedCount++;
          const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
          return `~~${i.position}. ${dFormat(i.item_type)}~~ 👤 ${nameDisplay}`;
        }
        return `${i.position}. ${dFormat(i.item_type)} ✅`;
      });

      embed.addFields({
        name: `${pageEmojis} หน้า ${page.name}`,
        value: lines.join('\n') || '-',
        inline: true,
      });
    }

    const fieldCount = pageSlice.length;
    if (fieldCount % 3 !== 0) {
      for (let p = 0; p < (3 - (fieldCount % 3)); p++) embed.addFields({ name: '\u200b', value: '\u200b', inline: true });
    }
    embeds.push(embed);
  }

  const remaining = totalItems - reservedCount;
  const description = `**${reservedCount}/${totalItems}** จองแล้ว • **${remaining}** ว่างอยู่\nพิมพ์ \`/available\` เพื่อดูรายการว่างและจองได้เลย!`;
  
  const finalEmbeds = embeds.slice(0, 10);
  finalEmbeds[0].setDescription(description);
  finalEmbeds[finalEmbeds.length - 1].setFooter({ text: 'Auto-updates on reserve' }).setTimestamp();

  return { embeds: finalEmbeds, totalItems, reservedCount };
}

/**
 * สร้าง buttons สำหรับ items ที่ยังว่าง
 */
async function buildBoardButtons(round, guild = null) {
  const availableItems = await db.getAvailableItems(round.id);
  if (availableItems.length === 0) return { albumBundles: [], ldBundles: [], tsBundles: [] };

  const albums = [];
  const featherPagesMap = new Map();

  for (const item of availableItems) {
    const t = item.item_type.toLowerCase();
    if (t === 'album') {
      albums.push(item);
    } else {
      if (!featherPagesMap.has(item.page_id)) {
        featherPagesMap.set(item.page_id, { page_name: item.page_name, page_id: item.page_id, items: [] });
      }
      featherPagesMap.get(item.page_id).items.push(item);
    }
  }

  const ldPages = [], tsPages = [];
  for (const page of featherPagesMap.values()) {
    if (page.items.some(i => i.item_type.toLowerCase() === 'light-dark')) ldPages.push(page);
    else tsPages.push(page);
  }

  const createGroupBundles = (items, type, emojiStr, prefix, btnStyle) => {
    const bundles = [];
    let currentRows = [], currentRow = new ActionRowBuilder();

    for (const item of items) {
      const id = type === 'album' ? item.id : item.page_id;
      let label = type === 'album' ? `หน้า ${item.page_name} #${item.position}` : `หน้า ${item.page_name}`;
      
      const btn = new ButtonBuilder().setCustomId(`${prefix}${id}`).setLabel(label).setStyle(btnStyle);
      if (type === 'album') btn.setEmoji(emojiStr);
      currentRow.addComponents(btn);

      if (currentRow.components.length === 5) {
        currentRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      if (currentRows.length === 5) {
        bundles.push(currentRows);
        currentRows = [];
      }
    }
    if (currentRow.components.length > 0) currentRows.push(currentRow);
    if (currentRows.length > 0) bundles.push(currentRows);
    return bundles;
  };

  return {
    albumBundles: createGroupBundles(albums, 'album', resolveEmoji(ICONS.ALBUM, guild, '📒'), LB_BOOK_PREFIX, ButtonStyle.Primary),
    ldBundles: createGroupBundles(ldPages, 'ld', null, LB_FEATHER_PREFIX, ButtonStyle.Success),
    tsBundles: createGroupBundles(tsPages, 'ts', null, LB_FEATHER_PREFIX, ButtonStyle.Secondary)
  };
}

async function sendLiveBoard(client, channelId, round) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;

    const { embeds } = await buildBoardEmbed(round, channel.guild);
    const { albumBundles, ldBundles, tsBundles } = await buildBoardButtons(round, channel.guild);

    const embIds = [], albIds = [], ldIds = [], tsIds = [];

    for (const embed of embeds) {
      const msg = await channel.send({ embeds: [embed] });
      embIds.push(msg.id);
    }
    const sendGroup = async (bundles, targetIds, emptyText) => {
      if (bundles.length > 0) {
        for (const bundle of bundles) {
          const msg = await channel.send({ components: bundle });
          targetIds.push(msg.id);
        }
      } else {
        const msg = await channel.send({ content: emptyText });
        targetIds.push(msg.id);
      }
    };

    await sendGroup(albumBundles, albIds, '**[ 📒 สมุด / Albums ]** หมดแล้ว / ไม่มีรายการ');
    await sendGroup(ldBundles, ldIds, '**[ 🤍 ขนนก (Light-Dark) ]** หมดแล้ว / ไม่มีรายการ');
    await sendGroup(tsBundles, tsIds, '**[ ❤️ ขนนก (Time-Space) ]** หมดแล้ว / ไม่มีรายการ');

    // 4. Send Branding Button
    const brandingBtn = new ButtonBuilder()
      .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
      .setURL(BRANDING.URL)
      .setStyle(ButtonStyle.Link);
    const brandingRow = new ActionRowBuilder().addComponents(brandingBtn);
    const brandingMsg = await channel.send({ components: [brandingRow] });

    const structuredIds = [
      `EMB:${embIds.join(',')}`, 
      `ALB:${albIds.join(',')}`, 
      `LD:${ldIds.join(',')}`, 
      `TS:${tsIds.join(',')}`,
      `BRD:${brandingMsg.id}`
    ].join('|');

    await db.saveRoundBoardMessage(round.id, channelId, structuredIds);
    return { id: embIds[0] };
  } catch (err) {
    console.error('❌ Failed to send live board:', err);
    return null;
  }
}

const activeUpdates = new Map();

async function updateLiveBoard(client, roundId) {
  _performUpdate(client, roundId);
}

async function _performUpdate(client, roundId) {
  if (activeUpdates.get(roundId)) {
    activeUpdates.set(`${roundId}_pending`, true);
    return;
  }
  activeUpdates.set(roundId, true);
  
  try {
    const boardInfo = await db.getRoundBoardMessage(roundId);
    if (!boardInfo?.board_channel_id || !boardInfo?.board_message_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id).catch(() => null);
    if (!channel) return;

    const ids = parseBoardIds(boardInfo.board_message_id);
    const { embeds } = await buildBoardEmbed({ id: roundId }, channel.guild);
    const { albumBundles, ldBundles, tsBundles } = await buildBoardButtons({ id: roundId }, channel.guild);
    
    const editPromises = [];
    for (let i = 0; i < Math.min(embeds.length, ids.emb.length); i++) {
      editPromises.push(channel.messages.edit(ids.emb[i], { embeds: [embeds[i]] }).catch(() => null));
    }

    const updateBundleGroup = (bundles, msgIds, label) => {
      for (let i = 0; i < msgIds.length; i++) {
        if (i < bundles.length) {
          editPromises.push(channel.messages.edit(msgIds[i], { components: bundles[i], content: null }).catch(() => null));
        } else if (i === 0) {
          editPromises.push(channel.messages.edit(msgIds[i], { content: `**[ ${label} ]** หมดแล้ว / ไม่มีรายการ`, components: [] }).catch(() => null));
        } else {
          editPromises.push(channel.messages.edit(msgIds[i], { content: '.', components: [] }).catch(() => null));
        }
      }
    };

    updateBundleGroup(albumBundles, ids.alb, '📒 สมุด');
    updateBundleGroup(ldBundles, ids.ld, '🤍 ขนนก (LD)');
    updateBundleGroup(tsBundles, ids.ts, '❤️ ขนนก (TS)');

    // Update Branding (Ensure it still exists and has the button)
    if (ids.brd && ids.brd.length > 0) {
      const brandingBtn = new ButtonBuilder()
        .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
        .setURL(BRANDING.URL)
        .setStyle(ButtonStyle.Link);
      const brandingRow = new ActionRowBuilder().addComponents(brandingBtn);
      editPromises.push(channel.messages.edit(ids.brd[0], { components: [brandingRow] }).catch(() => null));
    }

    await Promise.all(editPromises);
    console.log(`✅ Live board updated for Round ${roundId}`);
  } catch (err) {
    console.error('❌ Failed to update live board:', err);
  } finally {
    activeUpdates.set(roundId, false);
    if (activeUpdates.get(`${roundId}_pending`)) {
      activeUpdates.set(`${roundId}_pending`, false);
      _performUpdate(client, roundId);
    }
  }
}

async function closeLiveBoard(client, round) {
  try {
    const boardInfo = await db.getRoundBoardMessage(round.id);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id).catch(() => null);
    if (!channel) return;

    const ids = parseBoardIds(boardInfo.board_message_id);
    const { embeds } = await buildBoardEmbed(round, channel.guild);
    
    const editPromises = [];
    for (let i = 0; i < Math.min(embeds.length, ids.emb.length); i++) {
      const closedEmbed = EmbedBuilder.from(embeds[i]).setTitle(`🛑 ปิดรับจองแล้ว — ${round.name}`).setColor(0xEF4444);
      editPromises.push(channel.messages.edit(ids.emb[i], { embeds: [closedEmbed] }).catch(() => null));
    }

    [...ids.alb, ...ids.ld, ...ids.ts, ...ids.brd].forEach(msgId => {
      editPromises.push(channel.messages.delete(msgId).catch(() => null));
    });

    await Promise.all(editPromises);
  } catch (err) {
    console.error('❌ Failed to close live board:', err);
  }
}

module.exports = {
  sendLiveBoard,
  updateLiveBoard,
  closeLiveBoard,
  LB_FEATHER_PREFIX,
  LB_BOOK_PREFIX,
};
