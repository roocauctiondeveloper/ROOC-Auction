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
const { ICONS, ITEM_TYPES } = require('../utils/constants');
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
 * Format: EMB:id1,id2|ALB:id3,id4|LD:id5|TS:id6
 */
function parseBoardIds(idStr) {
  if (!idStr) return { emb: [], alb: [], ld: [], ts: [] };
  
  // Backward compatibility
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
  });
  return result;
} // lb_b:<itemId>

/**
 * สร้าง embeds แสดง grid ของทุก page และ items พร้อมสถานะ (รองรับเกิน 25 หน้า)
 * Optimized: เรียก DB ทีเดียวจบ ป้องกัน N+1 Query
 */
async function buildBoardEmbed(round, guild = null) {
  const allData = await db.getAllBoardData(round.id);
  
  if (allData.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 Live Board — ${round.name}`)
      .setColor(0x57F287)
      .setDescription('ยังไม่มีสินค้าในระบบ\nใช้ `/available` เพื่อดูรายการที่ว่าง')
      .setTimestamp();
    return { embeds: [embed], totalItems: 0, reservedCount: 0 };
  }

  // จัดกลุ่มข้อมูลตาม Page ID
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
  
  // แบ่งหน้าละ 24 หน้าต่อ 1 Embed เพื่อให้ได้รูปแบบ Grid (24 หาร 3 ลงตัวพอดี)
  for (let i = 0; i < pages.length; i += 24) {
    const pageSlice = pages.slice(i, i + 24);
    const embed = new EmbedBuilder().setColor(0x57F287);

    if (i === 0) {
      embed.setTitle(`📋 Live Board — ${round.name}`);
    }

    for (const page of pageSlice) {
      totalItems += page.items.length;

      const types = [...new Set(page.items.map(i => i.item_type))];
      const pageEmojis = types.map(t => getEmoji(t, guild)).join('');

      const d = (type) => {
        const tInfo = getItemData(type);
        return `${resolveEmoji(tInfo?.emoji, guild, ICONS.DEFAULT)} ${tInfo?.label ?? type}`;
      };

      const lines = page.items.map(i => {
        if (i.reserved_by) {
          reservedCount++;
          const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
          return `~~${i.position}. ${d(i.item_type)}~~ 👤 ${nameDisplay}`;
        }
        return `${i.position}. ${d(i.item_type)} ✅`;
      });

      embed.addFields({
        name: `${pageEmojis} หน้า ${page.name}`,
        value: lines.join('\n') || '-',
        inline: true,
      });
    }

    // เติมช่องว่างเพื่อให้ Grid ครบ 3 คอลัมน์ (ป้องกัน Discord แสดงผลเบี้ยวกลาง)
    const fieldCount = pageSlice.length;
    if (fieldCount % 3 !== 0) {
      const paddingNeeded = 3 - (fieldCount % 3);
      for (let p = 0; p < paddingNeeded; p++) {
        embed.addFields({ name: '\u200b', value: '\u200b', inline: true });
      }
    }

    embeds.push(embed);
  }

  const remaining = totalItems - reservedCount;
  const description = `**${reservedCount}/${totalItems}** จองแล้ว • **${remaining}** ว่างอยู่\n` +
    `พิมพ์ \`/available\` เพื่อดูรายการว่างและจองได้เลย!`;
  
  // Discord บังคับห้ามเกิน 10 Embeds ต่อ 1 ข้อความ
  const finalEmbeds = embeds.slice(0, 10);
  
  finalEmbeds[0].setDescription(description);
  finalEmbeds[finalEmbeds.length - 1].setFooter({ 
    text: `Auto-updates on reserve • /mystuff to view yours${embeds.length > 10 ? ' (บางรายการถูกซ่อนเนื่องจากข้อจำกัด)' : ''}`,
  }).setTimestamp();

  return { embeds: finalEmbeds, totalItems, reservedCount };
}

/**
 * สร้าง buttons สำหรับ items ที่ยังว่าง
 * Album -> Light-Dark -> Time-Space
 * พยายามแสดงเป็นปุ่มให้มากที่สุด ถ้าพื้นที่ (5 แถว) ไม่พอ ค่อยแปลงกลุ่มล่างๆ เป็น Dropdown
 */
async function buildBoardButtons(round, guild = null) {
  const availableItems = await db.getAvailableItems(round.id);
  if (availableItems.length === 0) return [];

  const albums = [];
  const featherPagesMap = new Map();

  for (const item of availableItems) {
    const t = item.item_type.toLowerCase();
    if (t === 'album') {
      albums.push(item);
    } else if (['light-dark', 'time-space'].includes(t)) {
      if (!featherPagesMap.has(item.page_id)) {
        featherPagesMap.set(item.page_id, { page_name: item.page_name, page_id: item.page_id, items: [] });
      }
      featherPagesMap.get(item.page_id).items.push(item);
    }
  }

  const ldPages = [];
  const tsPages = [];
  for (const page of featherPagesMap.values()) {
    const hasLD = page.items.some(i => i.item_type.toLowerCase() === 'light-dark');
    if (hasLD) {
      ldPages.push(page); // ถ้ามีขาว ดึงเข้ากลุ่มขาวเลย
    } else {
      tsPages.push(page); // แดงล้วน ไปอยู่กลุ่มแดง
    }
  }

  const { StringSelectMenuBuilder } = require('discord.js');

  const createGroupBundles = (items, type, emojiStr, placeholder, prefix, btnStyle) => {
    const bundles = []; // Array of ActionRowBuilder[] (แต่ละตัวคือ 1 ข้อความ มีได้ไม่เกิน 5 แถว)
    if (items.length === 0) return bundles;

    let currentRows = [];
    let currentRow = new ActionRowBuilder();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = type === 'album' ? item.id : item.page_id;
      
      let label = '';
      if (type === 'album') {
        label = `หน้า ${item.page_name} #${item.position}`;
      } else {
        const hasLD = item.items.some(x => x.item_type.toLowerCase() === 'light-dark');
        const hasTS = item.items.some(x => x.item_type.toLowerCase() === 'time-space');
        const combinedEmoji = (hasLD && hasTS) ? '🤍❤️' : (hasTS ? '❤️' : '🤍');
        label = `${combinedEmoji} หน้า ${item.page_name}`;
      }
      
      const btn = new ButtonBuilder()
        .setCustomId(`${prefix}${id}`)
        .setLabel(label)
        .setStyle(btnStyle);
        
      if (type === 'album') btn.setEmoji(emojiStr);
      currentRow.addComponents(btn);

      // ถ้าปุ่มเต็ม 5 ปุ่มแล้ว ให้ปิดแถว
      if (currentRow.components.length === 5) {
        currentRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      // ถ้าแถวเต็ม 5 แถวแล้ว (25 ปุ่ม) ให้ปิด bundle (1 ข้อความ)
      if (currentRows.length === 5) {
        bundles.push(currentRows);
        currentRows = [];
      }
    }

    // เก็บเศษที่เหลือ
    if (currentRow.components.length > 0) {
      currentRows.push(currentRow);
    }
    if (currentRows.length > 0) {
      bundles.push(currentRows);
    }

    return bundles;
  };

  const albumBundles = createGroupBundles(albums, 'album', resolveEmoji(ICONS.ALBUM, guild, '📒'), '📒 เลือกสมุดที่ต้องการจอง...', LB_BOOK_PREFIX, ButtonStyle.Primary);
  const ldBundles = createGroupBundles(ldPages, 'ld', getEmoji('Light-Dark', guild) || '🤍', '🤍 เลือกหน้า Light-Dark ที่ต้องการจอง...', LB_FEATHER_PREFIX, ButtonStyle.Success);
  const tsBundles = createGroupBundles(tsPages, 'ts', getEmoji('Time-Space', guild) || '❤️', '❤️ เลือกหน้า Time-Space ที่ต้องการจอง...', LB_FEATHER_PREFIX, ButtonStyle.Secondary);

  return { albumBundles, ldBundles, tsBundles };
};



/**
 * ส่ง Live Board message ใหม่ตอนเปิดรอบ
 */
async function sendLiveBoard(client, channelId, round) {
  console.log('🏁 sendLiveBoard started | Channel:', channelId, '| Round:', round.id);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      console.warn('⚠️ Channel not found or not text-based:', channelId);
      return null;
    }

    console.log('📋 Building board components...');
    const { embeds } = await buildBoardEmbed(round, channel.guild);
    const { albumBundles, ldBundles, tsBundles } = await buildBoardButtons(round, channel.guild);

    console.log('📤 Sending multiple messages to Discord...');
    const embIds = [], albIds = [], ldIds = [], tsIds = [];

    // 1. ส่ง Embeds (แยก bubble ละ 24 หน้า)
    for (const embed of embeds) {
      const msg = await channel.send({ embeds: [embed] });
      embIds.push(msg.id);
    }

    // 2. ส่งปุ่ม สมุด
    if (albumBundles.length > 0) {
      for (const bundle of albumBundles) {
        const msg = await channel.send({ components: bundle });
        albIds.push(msg.id);
      }
    } else {
      const msg = await channel.send({ content: '**[ 📒 สมุด / Albums ]** หมดแล้ว / ไม่มีรายการ' });
      albIds.push(msg.id);
    }

    // 3. ส่งปุ่ม ขาว
    if (ldBundles.length > 0) {
      for (const bundle of ldBundles) {
        const msg = await channel.send({ components: bundle });
        ldIds.push(msg.id);
      }
    } else {
      const msg = await channel.send({ content: '**[ 🤍 ขนนก (Light-Dark) ]** หมดแล้ว / ไม่มีรายการ' });
      ldIds.push(msg.id);
    }

    // 4. ส่งปุ่ม แดง
    if (tsBundles.length > 0) {
      for (const bundle of tsBundles) {
        const msg = await channel.send({ components: bundle });
        tsIds.push(msg.id);
      }
    } else {
      const msg = await channel.send({ content: '**[ ❤️ ขนนก (Time-Space) ]** หมดแล้ว / ไม่มีรายการ' });
      tsIds.push(msg.id);
    }

    // รวม IDs แบบมีโครงสร้าง: EMB:id1,id2|ALB:id3|LD:id4|TS:id5
    const structuredIds = [
      `EMB:${embIds.join(',')}`,
      `ALB:${albIds.join(',')}`,
      `LD:${ldIds.join(',')}`,
      `TS:${tsIds.join(',')}`
    ].join('|');

    console.log('✅ Live board messages sent:', structuredIds);

    await db.saveRoundBoardMessage(round.id, channelId, structuredIds);
    return { id: embIds[0] };
  } catch (err) {
    console.error('❌ Failed to send live board:', err);
    return null;
  }
}


const activeUpdates = new Map();

/**
 * Edit Live Board message เมื่อมีการจอง (Debounced & Queued)
 * เพื่อป้องกันการชนกัน (Concurrency) และการโดน Discord Rate Limit
 */
async function updateLiveBoard(client, roundId) {
  // เรียก performUpdate ทันที โดยที่ภายใน _performUpdate มีระบบ Lock/Queue อยู่แล้ว
  // ซึ่งจะช่วยให้การกดครั้งแรกตอบสนองทันที และการกดรัวๆ จะถูกรวบไปอัปเดตในรอบถัดไป
  _performUpdate(client, roundId);
}

async function _performUpdate(client, roundId) {
  // ป้องกันการรันซ้อนกัน (Lock)
  if (activeUpdates.get(roundId)) {
    // ถ้ากำลังอัปเดตอยู่ ให้รอและรันใหม่หลังจบ (Queue)
    activeUpdates.set(`${roundId}_pending`, true);
    return;
  }

  activeUpdates.set(roundId, true);
  
  try {
    const start = Date.now();
    const boardInfo = await db.getRoundBoardMessage(roundId);
    if (!boardInfo?.board_channel_id || !boardInfo?.board_message_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id).catch(() => null);
    if (!channel) return;

    const ids = parseBoardIds(boardInfo.board_message_id);

    // 1. ดึงข้อมูลใหม่
    const { embeds } = await buildBoardEmbed({ id: roundId }, channel.guild);
    const { albumBundles, ldBundles, tsBundles } = await buildBoardButtons({ id: roundId }, channel.guild);
    
    const editPromises = [];
    
    // 2. เตรียมอัปเดต Embeds
    for (let i = 0; i < Math.min(embeds.length, ids.emb.length); i++) {
      editPromises.push(channel.messages.edit(ids.emb[i], { embeds: [embeds[i]] }).catch(() => null));
    }

    // Helper: อัปเดตกลุ่มปุ่ม
    const updateBundleGroup = (bundles, msgIds) => {
      for (let i = 0; i < msgIds.length; i++) {
        const msgId = msgIds[i];
        if (i < bundles.length) {
          editPromises.push(channel.messages.edit(msgId, { components: bundles[i], content: null }).catch(() => null));
        } else {
          if (i === 0) {
            const emptyLabel = msgIds === ids.alb ? '📒 สมุด' : (msgIds === ids.ld ? '🤍 ขนนก (LD)' : '❤️ ขนนก (TS)');
            editPromises.push(channel.messages.edit(msgId, { content: `**[ ${emptyLabel} ]** หมดแล้ว / ไม่มีรายการ`, components: [] }).catch(() => null));
          } else {
            editPromises.push(channel.messages.edit(msgId, { content: '.', components: [] }).catch(() => null));
          }
        }
      }
    };

    updateBundleGroup(albumBundles, ids.alb);
    updateBundleGroup(ldBundles, ids.ld);
    updateBundleGroup(tsBundles, ids.ts);

    // 3. ยิง Update ไปที่ Discord (parallel)
    await Promise.all(editPromises);
    console.log(`✅ Live board updated in ${Date.now() - start}ms (Debounced)`);

  } catch (err) {
    console.error('❌ Failed to update live board:', err);
  } finally {
    activeUpdates.set(roundId, false);
    // ถ้ามีงานค้างอยู่ ให้รันต่อทันที
    if (activeUpdates.get(`${roundId}_pending`)) {
      activeUpdates.set(`${roundId}_pending`, false);
      await _performUpdate(client, roundId);
    }
  }
}

/**
 * Edit Live Board ตอนปิดรอบ — แสดงสรุปและลบ buttons
 */
async function closeLiveBoard(client, round) {
  console.log('🏁 closeLiveBoard started | Round:', round.id);
  try {
    const boardInfo = await db.getRoundBoardMessage(round.id);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const ids = parseBoardIds(boardInfo.board_message_id);

    const allData = await db.getAllBoardData(round.id);
    const pagesMap = new Map();
    for (const row of allData) {
      if (!pagesMap.has(row.page_id)) pagesMap.set(row.page_id, { name: row.page_name, items: [] });
      pagesMap.get(row.page_id).items.push(row);
    }
    const pages = Array.from(pagesMap.values());
    
    const embeds = [];
    let totalItems = 0, reservedCount = 0;

    for (let i = 0; i < pages.length; i += 24) {
      const pageSlice = pages.slice(i, i + 24);
      const embed = new EmbedBuilder().setColor(0xEF4444);
      if (i === 0) embed.setTitle(`🛑 ปิดรับจองแล้ว — ${round.name}`).setDescription('รอบนี้ปิดรับจองแล้ว ไม่สามารถจองเพิ่มได้');

      for (const page of pageSlice) {
        totalItems += page.items.length;
        const types = [...new Set(page.items.map(i => i.item_type))];
        const pageEmojis = types.map(t => getEmoji(t, channel.guild)).join('');

        const d = (type) => {
          const tInfo = getItemData(type);
          return `${resolveEmoji(tInfo?.emoji, channel.guild, ICONS.DEFAULT)} ${tInfo?.label ?? type}`;
        };

        const lines = page.items.map(i => {
          if (i.reserved_by) {
            reservedCount++;
            const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
            return `~~${i.position}. ${d(i.item_type)}~~ 👤 ${nameDisplay}`;
          }
          return `${i.position}. ${d(i.item_type)} ❌ ไม่มีคนจอง`;
        });
        embed.addFields({ name: `${pageEmojis} หน้า ${page.name}`, value: lines.join('\n') || '-', inline: true });
      }
      
      const fieldCount = pageSlice.length;
      if (fieldCount % 3 !== 0) {
        const paddingNeeded = 3 - (fieldCount % 3);
        for (let p = 0; p < paddingNeeded; p++) embed.addFields({ name: '\u200b', value: '\u200b', inline: true });
      }
      embeds.push(embed);
    }

    if (embeds.length > 0) {
      embeds[embeds.length - 1].setFooter({ text: `Total: ${reservedCount}/${totalItems} Reserved` }).setTimestamp();
    }

    const editPromises = [];
    const deletePromises = [];
    
    // อัปเดต Embeds (คงไว้)
    for (let i = 0; i < Math.min(embeds.length, ids.emb.length); i++) {
      editPromises.push(channel.messages.edit(ids.emb[i], { embeds: [embeds[i]] }).catch(() => null));
    }

    // ลบข้อความที่เป็นปุ่มทิ้งทั้งหมด
    [...ids.alb, ...ids.ld, ...ids.ts].forEach(msgId => {
      deletePromises.push(channel.messages.delete(msgId).catch(() => null));
    });

    await Promise.all([...editPromises, ...deletePromises]);
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
