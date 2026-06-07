/**
 * Live Reservation Board
 * Send an embed grid showing every page's item status with reservation buttons.
 * Edit the board messages whenever reservations change.
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

// Case-insensitive item metadata lookup.
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

// Live board button prefixes, kept separate from /available.
const LB_FEATHER_PREFIX = 'lb_f_';
const LB_BOOK_PREFIX = 'lb_b_';

/**
 * Parse structured message IDs.
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
 * Build board embeds.
 */
async function buildBoardEmbed(round, guild = null) {
  const allData = await db.getAllBoardData(round.id);

  if (allData.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 Live Board — ${round.name}`)
      .setColor(0x57F287)
      .setDescription('No items have been added yet.')
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
        // Check both the reserved name and Discord user ID.
        if (i.reserved_by !== null && i.reserved_by !== undefined && i.reserved_by !== '') {
          reservedCount++;
          const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
          return `~~${i.position}. ${dFormat(i.item_type)}~~ 👤 ${nameDisplay}`;
        }
        return `${i.position}. ${dFormat(i.item_type)} ✅`;
      });

      embed.addFields({
        name: `${pageEmojis} Page ${page.name}`,
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
  const description = `**${reservedCount}/${totalItems}** reserved • **${remaining}** available\nUse \`/available\` to view available items and reserve them.`;

  if (embeds.length > 0) {
    embeds[0].setDescription(description);
    embeds[embeds.length - 1].setFooter({ text: 'Auto-updates on reserve' }).setTimestamp();
  }

  const totalChars = embeds.reduce((sum, emb) => sum + (JSON.stringify(emb.data).length), 0);
  console.log(`📊 Embeds built: ${embeds.length} messages, Total approx chars: ${totalChars}`);

  return { embeds, totalItems, reservedCount };
}

/**
 * Build buttons for available items.
 */
async function buildBoardButtons(round, guild = null) {
  const allData = await db.getAllBoardData(round.id);
  if (allData.length === 0) return { ldBundles: [], tsBundles: [] };

  // Map database item_id to id for downstream compatibility
  const items = allData.map(item => ({
    ...item,
    id: item.item_id
  }));

  const ldItems = items.filter(i => i.item_type.toLowerCase() === 'light-dark');
  const tsItems = items.filter(i => i.item_type.toLowerCase() === 'time-space');

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
      // Logic B: Quota >= 4 -> Proportional Splitting with Strict Order
      // 1. Group items by page
      const itemsByPage = {};
      items.forEach(item => {
        if (!itemsByPage[item.page_name]) itemsByPage[item.page_name] = [];
        itemsByPage[item.page_name].push(item);
      });

      const sortedPageNames = Object.keys(itemsByPage).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // 2. Count total items and pages to determine ratios
      const idealSizes = [];
      let rem = bundleSize;
      while (rem > 0) {
        if (rem >= 4) { idealSizes.push(4); rem -= 4; }
        else { idealSizes.push(rem); rem = 0; }
      }
      
      const fullCountTarget = idealSizes.filter(s => s === 4).length;
      const partialCountTarget = idealSizes.filter(s => s < 4).length;
      const totalButtonsTarget = fullCountTarget + partialCountTarget;
      const maxPartialRatio = partialCountTarget / totalButtonsTarget;
      const targetSize = idealSizes.length > 1 ? idealSizes[idealSizes.length - 1] : 4;

      // 3. Separate pages into potential Full Pages (exactly 4 items) and Partial Pages (< 4 items)
      const potentialFullPages = [];
      const actualPartialPages = [];

      for (const pageName of sortedPageNames) {
        const pageItems = itemsByPage[pageName].sort((a, b) => a.position - b.position);
        if (pageItems.length === 4) {
          potentialFullPages.push(pageItems);
        } else {
          actualPartialPages.push(pageItems);
        }
      }

      // Calculate how many full pages we can afford to split to keep our ratio below maxPartialRatio
      let allowedSplits = 0;
      if (targetSize < 4) {
        // Target: (Partials + splits * Math.ceil(4/targetSize)) / (Total + splits * (Math.ceil(4/targetSize) - 1)) <= maxPartialRatio
        // We can solve this step-by-step or simulate by incrementing allowed splits
        let currentPartials = actualPartialPages.length; // assuming each unsplit partial page is 1 button if not split further
        let currentTotal = potentialFullPages.length + currentPartials;

        // If target size splits partial pages further:
        let totalPartialsFromActual = 0;
        actualPartialPages.forEach(p => {
          totalPartialsFromActual += Math.ceil(p.length / targetSize);
        });
        currentPartials = totalPartialsFromActual;
        currentTotal = potentialFullPages.length + currentPartials;

        const splitCostPartials = Math.ceil(4 / targetSize);
        const splitCostTotal = splitCostPartials - 1; // replaces 1 full page button with N partial buttons

        while (allowedSplits < potentialFullPages.length) {
          const nextPartials = currentPartials + splitCostPartials;
          const nextTotal = currentTotal + splitCostTotal;
          if (nextPartials / nextTotal > maxPartialRatio) {
            break; // Exceeded allowed ratio of partials, stop splitting
          }
          currentPartials = nextPartials;
          currentTotal = nextTotal;
          allowedSplits++;
        }
      }

      // We split the allowed splits from the end of the full pages list
      const splitThresholdIndex = potentialFullPages.length - allowedSplits;
      
      const fullChunks = potentialFullPages.slice(0, splitThresholdIndex);
      const toSplitFullPages = potentialFullPages.slice(splitThresholdIndex);

      const partialChunks = [];

      // Sort full pages by page number ascending
      fullChunks.sort((a, b) => a[0].page_name.localeCompare(b[0].page_name, undefined, { numeric: true }));

      if (targetSize < 4) {
        // Sequential cross-page bundling:
        // Merge toSplitFullPages + actualPartialPages, sort by page number,
        // flatten all items into one sequential array, then chunk by targetSize.
        // This ensures leftover items (e.g. P.24[4]) are combined with the
        // beginning of the next page (e.g. P.25[1,2]) into a single button
        // instead of floating to the end as orphaned x1 buttons.
        const allRemainingPages = [...toSplitFullPages, ...actualPartialPages];
        allRemainingPages.sort((a, b) => a[0].page_name.localeCompare(b[0].page_name, undefined, { numeric: true }));

        const remainingItems = [];
        for (const pageItems of allRemainingPages) {
          remainingItems.push(...pageItems);
        }

        for (let i = 0; i < remainingItems.length; i += targetSize) {
          partialChunks.push(remainingItems.slice(i, i + targetSize));
        }
      } else {
        // targetSize >= 4: no splitting of full pages needed.
        // Only push actual partial pages (pages with < 4 items) as-is.
        for (const pageItems of actualPartialPages) {
          partialChunks.push(pageItems);
        }
        partialChunks.sort((a, b) => a[0].page_name.localeCompare(b[0].page_name, undefined, { numeric: true }));
      }

      allSubChunks.push(...fullChunks, ...partialChunks);
    }

    // Note: Removed sorting by page_name to keep the "Full pages first, then Partial/Split pages" layout.

    const allRows = [];
    let currentRow = new ActionRowBuilder();
    const maxButtons = allSubChunks.length;

    console.log(`\n--- [ROUND LOG: ${type.toUpperCase()} BUTTONS] ---`);

    let vacantCount = 0;
    let partialCount = 0;
    let reservedCount = 0;

    for (let i = 0; i < maxButtons; i++) {
      const setSlice = allSubChunks[i];
      const idsStr = setSlice.map(item => item.id).join(',');
      
      // Check reservation status of the items in this chunk
      const vacantItems = setSlice.filter(item => !item.reserved_by);
      const reservedItems = setSlice.filter(item => item.reserved_by);
      const isFullyReserved = vacantItems.length === 0;

      if (isFullyReserved) {
        reservedCount++;
        continue; // 🚀 SKIP: Don't add button if fully reserved!
      } else if (reservedItems.length === 0) {
        vacantCount++;
      } else {
        partialCount++;
      }

      const isMain = setSlice.length === 4;
      const finalStyle = isMain ? btnStyle : (type === 'ld' ? ButtonStyle.Primary : ButtonStyle.Danger);

      const label = formatSetLabel(vacantItems);

      const btn = new ButtonBuilder()
        .setCustomId(`${prefix}${type}_bundle_${idsStr}`)
        .setLabel(label)
        .setStyle(finalStyle)
        .setDisabled(false);

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
    console.log(`[Board] Generated ${allSubChunks.length} ${type.toUpperCase()} buttons: ${summary} | State: ${vacantCount} vacant, ${partialCount} partial, ${reservedCount} reserved`);

    const messages = [];
    for (let i = 0; i < allRows.length; i += 5) {
      messages.push(allRows.slice(i, i + 5));
    }

    // Detailed debug log to inspect final generated button structure
    console.log(`[Board Debug - ${type.toUpperCase()}] Generated Buttons:`);
    const debugButtonList = allSubChunks.map((chunk, index) => {
      const vacantItems = chunk.filter(item => !item.reserved_by);
      const isMain = chunk.length === 4;
      const finalStyle = isMain ? btnStyle : (type === 'ld' ? ButtonStyle.Primary : ButtonStyle.Danger);
      const label = formatSetLabel(vacantItems);
      return `  Btn ${index + 1}: Label "${label}" | Style: ${finalStyle} | Items Count: ${chunk.length}`;
    });
    console.log(debugButtonList.join('\n'));

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
        messageCache.set(msg.id, JSON.stringify(embeds[i].data));
        if (i < embeds.length - 1) await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`❌ Failed to send Embed ${i}:`, err.message);
      }
    }

    const sendGroup = async (bundles, targetIds, emptyText) => {
      try {
        if (bundles.length > 0) {
          for (let i = 0; i < bundles.length; i++) {
            const bundle = bundles[i];
            const msg = await channel.send({ components: bundle });
            targetIds.push(msg.id);
            messageCache.set(msg.id, JSON.stringify(bundle.map(r => r.toJSON())));
            if (i < bundles.length - 1) await new Promise(r => setTimeout(r, 1500));
          }
        } else {
          const msg = await channel.send({ content: emptyText });
          targetIds.push(msg.id);
          messageCache.set(msg.id, `EMPTY_${emptyText}`);
        }
      } catch (err) {
        console.error(`❌ Failed to send group:`, err.message);
      }
    };

    await new Promise(r => setTimeout(r, 1500));
    await sendGroup(ldBundles, ldIds, '**[ 🤍 Feathers (Light-Dark) ]** Sold out / no items available');
    
    await new Promise(r => setTimeout(r, 1500));
    await sendGroup(tsBundles, tsIds, '**[ ❤️ Feathers (Time-Space) ]** Sold out / no items available');

    await new Promise(r => setTimeout(r, 1500));
    const myStuffBtn = new ButtonBuilder()
      .setCustomId('lb_mystuff')
      .setLabel('🎒 My Stuff & Quota')
      .setStyle(ButtonStyle.Primary);

    const brandingBtn = new ButtonBuilder()
      .setLabel(`Developed by ${BRANDING.EMOJI} ${BRANDING.DEVELOPER}`)
      .setURL(BRANDING.URL)
      .setStyle(ButtonStyle.Link);

    const row1 = new ActionRowBuilder().addComponents(myStuffBtn);
    const row2 = new ActionRowBuilder().addComponents(brandingBtn);

    const brandingMsg = await channel.send({ components: [row1, row2] });

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
const messageCache = new Map();

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
      const msgId = ids.emb[i];
      const newJson = JSON.stringify(embeds[i].data);
      if (messageCache.get(msgId) !== newJson) {
        messageCache.set(msgId, newJson);
        editPromises.push(
          channel.messages.edit(msgId, { embeds: [embeds[i]] })
            .catch(err => console.error(`❌ Failed to edit Embed ${i}:`, err.message))
        );
      }
    }

    const updateBundleGroup = (bundles, msgIds, label) => {
      if (!msgIds || msgIds.length === 0) return;
      for (let i = 0; i < msgIds.length; i++) {
        const msgId = msgIds[i];
        if (i < bundles.length) {
          const newJson = JSON.stringify(bundles[i].map(r => r.toJSON()));
          if (messageCache.get(msgId) !== newJson) {
            messageCache.set(msgId, newJson);
            editPromises.push(
              channel.messages.edit(msgId, { components: bundles[i], content: null })
                .catch(err => console.error(`❌ Failed to edit ${label} Bundle ${i}:`, err.message))
            );
          }
        } else if (i === 0) {
          const newJson = `EMPTY_${label}`;
          if (messageCache.get(msgId) !== newJson) {
            messageCache.set(msgId, newJson);
            editPromises.push(
              channel.messages.edit(msgId, { content: label, components: [] })
                .catch(err => console.error(`❌ Failed to clear ${label} Bundle:`, err.message))
            );
          }
        } else {
          const newJson = `DOT_${label}`;
          if (messageCache.get(msgId) !== newJson) {
            messageCache.set(msgId, newJson);
            editPromises.push(
              channel.messages.edit(msgId, { content: '.', components: [] })
                .catch(err => console.error(`❌ Failed to reset ${label} extra message:`, err.message))
            );
          }
        }
      }
    };

    updateBundleGroup(ldBundles, ids.ld, '**[ 🤍 Feathers (Light-Dark) ]** Sold out / no items available');
    updateBundleGroup(tsBundles, ids.ts, '**[ ❤️ Feathers (Time-Space) ]** Sold out / no items available');



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
      let closedEmbed = EmbedBuilder.from(embeds[i]).setColor(0xEF4444);
      if (i === 0) closedEmbed = closedEmbed.setTitle(`🛑 Reservations Closed — ${round.name}`);
      editPromises.push(channel.messages.edit(ids.emb[i], { embeds: [closedEmbed] }).catch(() => null));
    }

    [...ids.alb, ...ids.ld, ...ids.ts, ...ids.brd].forEach(msgId => {
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
