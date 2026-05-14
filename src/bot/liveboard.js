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
const BOOK_TYPES = ['Album', 'Illution Box', 'album', 'illution-box'];

// Button prefix สำหรับ live board (แยกจาก /available)
const LB_FEATHER_PREFIX = 'lb_f_';
const LB_BOOK_PREFIX = 'lb_b_';

/**
 * แยก Message IDs แบบมีโครงสร้าง
 */
function parseBoardIds(idStr) {
  if (!idStr) return { emb: [], alb: [], ld: [], ts: [], brd: [] };
  const result = { emb: [], alb: [], ld: [], ts: [], brd: [] };

  if (!idStr.includes('|')) {
    const ids = idStr.split(',');
    if (ids.length < 4) return { ...result, emb: ids };
    result.emb = ids.slice(0, ids.length - 3);
    result.alb = [ids[ids.length - 3]];
    result.ld = [ids[ids.length - 2]];
    result.ts = [ids[ids.length - 1]];
    return result;
  }

  const parts = idStr.split('|');
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

  for (let i = 0; i < pages.length; i += 18) {
    const pageSlice = pages.slice(i, i + 18);
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
  if (finalEmbeds.length > 0) {
    finalEmbeds[0].setDescription(description);
    finalEmbeds[finalEmbeds.length - 1].setFooter({ text: 'Auto-updates on reserve' }).setTimestamp();
  }

  const totalChars = finalEmbeds.reduce((sum, emb) => sum + (JSON.stringify(emb.data).length), 0);
  console.log(`📊 Embeds built: ${finalEmbeds.length} messages, Total approx chars: ${totalChars}`);

  return { embeds: finalEmbeds, totalItems, reservedCount };
}

/**
 * สร้าง buttons สำหรับ items ที่ยังว่าง
 */
async function buildBoardButtons(round, guild = null) {
  const availableItems = await db.getAvailableItems(round.id);
  if (availableItems.length === 0) return { ldBundles: [], tsBundles: [] };

  const ldItems = availableItems.filter(i => i.item_type.toLowerCase() === 'light-dark');
  const tsItems = availableItems.filter(i => i.item_type.toLowerCase() === 'time-space');

  const formatSetLabel = (items) => {
    const pages = {};
    items.forEach(i => {
      if (!pages[i.page_name]) pages[i.page_name] = [];
      pages[i.page_name].push(i.position);
    });

    const pageLabels = Object.entries(pages).map(([pageNum, posList]) => {
      posList.sort((a, b) => a - b);
      return `P.${pageNum} [${posList.join(', ')}]`;
    });

    let finalLabel = pageLabels.join(' | ');
    if (finalLabel.length > 55) {
      finalLabel = pageLabels.join(' | ').substring(0, 52) + '...';
    }
    return `${finalLabel} (x${items.length})`;
  };

  const createBundleRow = (type, items, quota, emojiStr, prefix, btnStyle) => {
    if (items.length === 0) return [];
    
    const bundleSize = quota || 1;
    const allSubChunks = [];

    if (bundleSize < 4) {
      // Logic A: Quota < 4 -> Strict Quota Sets (Allow mixing pages)
      for (let i = 0; i < items.length; i += bundleSize) {
        allSubChunks.push(items.slice(i, i + bundleSize));
      }
    } else {
      // Logic B: Quota >= 4 -> Page-First Grouping with Batch Splitting (4s first, then 2s)
      const itemsByPage = {};
      items.forEach(item => {
        if (!itemsByPage[item.page_name]) itemsByPage[item.page_name] = [];
        itemsByPage[item.page_name].push(item);
      });

      // Calculate ideal sub-chunks for this quota (e.g., 6 -> [4, 2], so targetSize = 2)
      const idealSizes = [];
      let rem = bundleSize;
      while (rem > 0) {
        if (rem >= 4) { idealSizes.push(4); rem -= 4; }
        else { idealSizes.push(rem); rem = 0; }
      }
      const targetSize = idealSizes.length > 1 ? idealSizes[idealSizes.length - 1] : 4;

      const sortedPageNames = Object.keys(itemsByPage).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      
      const fullPages = sortedPageNames.filter(name => itemsByPage[name].length === 4);
      
      let numSplit = 0;
      if (targetSize < 4) {
        const piecesPerPage = Math.floor(4 / targetSize);
        numSplit = Math.floor(fullPages.length / (piecesPerPage + 1));
      }
      const numKeep = fullPages.length - numSplit;

      const pool = [];
      let keptCount = 0;

      const flushPool = () => {
        if (pool.length === 0) return;
        for (let i = 0; i < pool.length; i += targetSize) {
          allSubChunks.push(pool.slice(i, i + targetSize));
        }
        pool.length = 0;
      };

      for (const pageName of sortedPageNames) {
        const pageItems = itemsByPage[pageName];
        if (pageItems.length === 4 && keptCount < numKeep) {
          flushPool();
          allSubChunks.push(pageItems);
          keptCount++;
        } else {
          pool.push(...pageItems);
        }
      }
      flushPool();
    }

    // Sort sub-chunks:
    // Priority: 1. Page Name (Asc), 2. Position (Asc)
    allSubChunks.sort((a, b) => {
      if (a[0].page_name !== b[0].page_name) {
        return a[0].page_name.localeCompare(b[0].page_name, undefined, { numeric: true });
      }
      return a[0].position - b[0].position;
    });

    const allRows = [];
    let currentRow = new ActionRowBuilder();
    const maxButtons = Math.min(allSubChunks.length, 40);

    console.log(`\n--- [ROUND LOG: ${type.toUpperCase()} BUTTONS] ---`);

    for (let i = 0; i < maxButtons; i++) {
      const setSlice = allSubChunks[i];
      const idsStr = setSlice.map(item => item.id).join(',');
      const numPages = new Set(setSlice.map(i => i.page_name)).size;

      // Color Logic: 
      // Main color if Full amount (up to 4) regardless of page mixing
      const maxChunkSize = Math.min(bundleSize, 4);
      const isMain = setSlice.length === maxChunkSize;
      let finalStyle = isMain ? btnStyle : (type === 'ld' ? ButtonStyle.Primary : ButtonStyle.Danger);

      const label = formatSetLabel(setSlice);
      // Removed per-button log
      const btn = new ButtonBuilder()
        .setCustomId(`${prefix}${type}_bundle_${idsStr}`)
        .setLabel(label)
        .setStyle(finalStyle);

      if (emojiStr) btn.setEmoji(resolveEmoji(emojiStr, guild, ICONS.DEFAULT));
      currentRow.addComponents(btn);

      if (currentRow.components.length === 5) {
        allRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    }
    if (currentRow.components.length > 0) allRows.push(currentRow);
    const sizes = allSubChunks.map(c => c.length);
    const summary = Array.from(new Set(sizes)).sort((a,b)=>b-a).map(s => `${sizes.filter(x=>x===s).length}x(${s})`).join(', ');
    console.log(`[Board] Generated ${allSubChunks.length} ${type.toUpperCase()} buttons: ${summary}`);

    const messages = [];
    for (let i = 0; i < allRows.length; i += 5) {
      messages.push(allRows.slice(i, i + 5));
    }
    return messages;
  };

  const { ldBundles, tsBundles } = {
    ldBundles: createBundleRow('ld', ldItems, round.quota_ld, ICONS.LIGHT_DARK, LB_FEATHER_PREFIX, ButtonStyle.Success),
    tsBundles: createBundleRow('ts', tsItems, round.quota_ts, ICONS.TIME_SPACE, LB_FEATHER_PREFIX, ButtonStyle.Secondary)
  };

  return { ldBundles, tsBundles };
}

async function sendLiveBoard(client, channelId, round) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;

    const { embeds } = await buildBoardEmbed(round, channel.guild);
    const { ldBundles, tsBundles } = await buildBoardButtons(round, channel.guild);

    const embIds = [], ldIds = [], tsIds = [];

    for (let i = 0; i < embeds.length; i++) {
      try {
        const msg = await channel.send({ embeds: [embeds[i]] });
        embIds.push(msg.id);
      } catch (err) {
        console.error(`❌ Failed to send Embed ${i}:`, err.message);
      }
    }

    const sendGroup = async (bundles, targetIds, emptyText) => {
      try {
        if (bundles.length > 0) {
          for (const bundle of bundles) {
            const msg = await channel.send({ components: bundle });
            targetIds.push(msg.id);
          }
        } else {
          const msg = await channel.send({ content: emptyText });
          targetIds.push(msg.id);
        }
      } catch (err) {
        console.error(`❌ Failed to send group:`, err.message);
      }
    };

    await sendGroup(ldBundles, ldIds, '**[ 🤍 ขนนก (Light-Dark) ]** หมดแล้ว / ไม่มีรายการ');
    await sendGroup(tsBundles, tsIds, '**[ ❤️ ขนนก (Time-Space) ]** หมดแล้ว / ไม่มีรายการ');

    const brandingBtn = new ButtonBuilder()
      .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
      .setURL(BRANDING.URL)
      .setStyle(ButtonStyle.Link);
    const brandingRow = new ActionRowBuilder().addComponents(brandingBtn);
    const brandingMsg = await channel.send({ components: [brandingRow] });

    const structuredIds = [
      `EMB:${embIds.join(',')}`,
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
  const start = Date.now();

  try {
    const boardInfo = await db.getRoundBoardMessage(roundId);
    if (!boardInfo?.board_channel_id || !boardInfo?.board_message_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id).catch(() => null);
    if (!channel) return;

    const round = await db.getRoundById(roundId);
    if (!round) return;

    const ids = parseBoardIds(boardInfo.board_message_id);
    const { embeds } = await buildBoardEmbed(round, channel.guild);
    const { ldBundles, tsBundles } = await buildBoardButtons(round, channel.guild);

    const editPromises = [];
    for (let i = 0; i < Math.min(embeds.length, ids.emb.length); i++) {
      editPromises.push(
        channel.messages.edit(ids.emb[i], { embeds: [embeds[i]] })
          .catch(err => console.error(`❌ Failed to edit Embed ${i}:`, err.message))
      );
    }

    const updateBundleGroup = (bundles, msgIds, label) => {
      if (!msgIds || msgIds.length === 0) return;
      for (let i = 0; i < msgIds.length; i++) {
        if (i < bundles.length) {
          editPromises.push(
            channel.messages.edit(msgIds[i], { components: bundles[i], content: null })
              .catch(err => console.error(`❌ Failed to edit ${label} Bundle ${i}:`, err.message))
          );
        } else if (i === 0) {
          editPromises.push(
            channel.messages.edit(msgIds[i], { content: `**[ ${label} ]** หมดแล้ว / ไม่มีรายการ`, components: [] })
              .catch(err => console.error(`❌ Failed to clear ${label} Bundle:`, err.message))
          );
        } else {
          editPromises.push(
            channel.messages.edit(msgIds[i], { content: '.', components: [] })
              .catch(err => console.error(`❌ Failed to reset ${label} extra message:`, err.message))
          );
        }
      }
    };

    updateBundleGroup(ldBundles, ids.ld, '**[ 🤍 ขนนก (Light-Dark) ]** หมดแล้ว / ไม่มีรายการ');
    updateBundleGroup(tsBundles, ids.ts, '**[ ❤️ ขนนก (Time-Space) ]** หมดแล้ว / ไม่มีรายการ');



    await Promise.all(editPromises);
    console.log(`✅ [Board Update] Round ${roundId} updated successfully in ${Date.now() - start}ms`);
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

    [...ids.alb, ...ids.ld, ...ids.ts].forEach(msgId => {
      if (msgId) editPromises.push(channel.messages.delete(msgId).catch(() => null));
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
