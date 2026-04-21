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

const DISP = { 
  'Album': 'Album', 
  'Light-Dark': 'Light-Dark', 
  'Time-Space': 'Time-Space',
  'light-dark': 'Light-Dark', 
  'time-space': 'Time-Space' 
};
const d = (t) => DISP[t] ?? t;

const FEATHER_TYPES = ['Light-Dark', 'Time-Space', 'light-dark', 'time-space'];

// Button prefix สำหรับ live board (แยกจาก /available)
const LB_FEATHER_PREFIX = 'lb_f:'; // lb_f:<pageId>
const LB_BOOK_PREFIX    = 'lb_b:'; // lb_b:<itemId>

/**
 * สร้าง embed แสดง grid ของทุก page และ items พร้อมสถานะ
 */
async function buildBoardEmbed(round) {
  const pages = await db.getAllPages();
  const embed = new EmbedBuilder()
    .setTitle(`📋 Live Board — ${round.name}`)
    .setColor(0x57F287)
    .setTimestamp();

  if (pages.length === 0) {
    embed.setDescription('ยังไม่มีสินค้าในระบบ\nใช้ `/available` เพื่อดูรายการที่ว่าง');
    return { embed, totalItems: 0, reservedCount: 0 };
  }

  let totalItems = 0;
  let reservedCount = 0;

  // Discord Limit: 25 fields per embed
  const displayPages = pages.slice(0, 25);
  for (const page of displayPages) {
    const items = await db.getItemsForPage(page.id, round.id);
    totalItems += items.length;

    const lines = items.map(i => {
      if (i.reserved_by) {
        reservedCount++;
        const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
        return `~~${i.position}. ${d(i.item_type)}~~ 👤 ${nameDisplay}`;
      }
      return `${i.position}. ${d(i.item_type)} ✅`;
    });

    embed.addFields({
      name: `📄 หน้า ${page.name}`,
      value: lines.join('\n') || '-',
      inline: true,
    });
  }

  // คำนวณ totalItems และ reservedCount สำหรับหน้าที่ไม่ได้แสดงด้วย (เพื่อให้เลขสรุปถูกต้อง)
  if (pages.length > 25) {
    const hiddenPages = pages.slice(25);
    for (const page of hiddenPages) {
      const items = await db.getItemsForPage(page.id, round.id);
      totalItems += items.length;
      reservedCount += items.filter(i => i.reserved_by).length;
    }
  }

  const remaining = totalItems - reservedCount;
  let description = `**${reservedCount}/${totalItems}** จองแล้ว • **${remaining}** ว่างอยู่\n` +
    `พิมพ์ \`/available\` เพื่อดูรายการว่างและจองได้เลย!`;
  
  if (pages.length > 25) {
    description += `\n⚠️ *แสดงผลเพียง 25 หน้าแรกจากทั้งหมด ${pages.length} หน้า*`;
  }
  
  embed.setDescription(description);
  embed.setFooter({ text: 'อัปเดตอัตโนมัติทุกครั้งที่มีการจอง • /mystuff เพื่อดูของที่จองไว้' });

  return { embed, totalItems, reservedCount };
}

/**
 * สร้าง buttons สำหรับ items ที่ยังว่าง (max 25)
 * ขนนก → button ต่อหน้า, Album → button ต่อชิ้น
 */
async function buildBoardButtons(round) {
  const availableItems = await db.getAvailableItems(round.id);
  if (availableItems.length === 0) return [];

  // จัด feather pages และ book items
  const featherPages = new Map();
  const bookItems = [];

  for (const item of availableItems) {
    const type = item.item_type;
    if (type === 'Light-Dark' || type === 'Time-Space' || type === 'light-dark' || type === 'time-space') {
      if (!featherPages.has(item.page_id)) {
        featherPages.set(item.page_id, { page_name: item.page_name, items: [] });
      }
      featherPages.get(item.page_id).items.push(item);
    } else {
      bookItems.push(item);
    }
  }

  const FEATHER_EMOJI = { 
    'Light-Dark': '🤍', 'Time-Space': '❤️',
    'light-dark': '🤍', 'time-space': '❤️' 
  };

  // เตรียมรายการทั้งหมดที่จะทำเป็นปุ่มหรือเมนู
  const allEntries = []; // { type: 'book'|'feather', id, label, emoji, data }

  // Album ก่อน
  for (const item of bookItems) {
    allEntries.push({
      type: 'book',
      id: item.id,
      label: `หน้า ${item.page_name} #${item.position}`,
      emoji: '📒'
    });
  }

  // Feather ต่อ
  const sortedFeatherEntries = [...featherPages.entries()].sort((a, b) => {
    const aHasLight = a[1].items.some(i => i.item_type.toLowerCase() === 'light-dark');
    const bHasLight = b[1].items.some(i => i.item_type.toLowerCase() === 'light-dark');
    if (aHasLight && !bHasLight) return -1;
    if (!aHasLight && bHasLight) return 1;
    return 0;
  });

  for (const [pageId, { page_name, items }] of sortedFeatherEntries) {
    const types = [...new Set(items.map(i => i.item_type))];
    const emoji = types.length === 1 ? (FEATHER_EMOJI[types[0]] || '🪶') : '🪶';
    allEntries.push({
      type: 'feather',
      id: pageId,
      label: `หน้า ${page_name}`,
      emoji: emoji
    });
  }

  if (allEntries.length === 0) return [];

  const rows = [];
  
  // ปรับ Logic: ถ้ามีเกิน 25 อย่าง (ล้นปุ่ม) ให้แบ่งที่ว่างให้ Dropdown ด้วย
  let buttonLimit = 25;
  if (allEntries.length > 25) {
    buttonLimit = 20; // ใช้ 4 แถวสำหรับปุ่ม อีก 1 แถวสำหรับ Dropdown
  }

  const buttonEntries = allEntries.slice(0, buttonLimit);
  const remainingEntries = allEntries.slice(buttonLimit, buttonLimit + 25);

  // 1. สร้างปุ่ม (Max 20 หรือ 25)
  let currentRow = new ActionRowBuilder();
  for (let i = 0; i < buttonEntries.length; i++) {
    const entry = buttonEntries[i];
    const btn = new ButtonBuilder()
      .setCustomId(`${entry.type === 'feather' ? LB_FEATHER_PREFIX : LB_BOOK_PREFIX}${entry.id}`)
      .setLabel(entry.label)
      .setStyle(entry.type === 'feather' ? ButtonStyle.Success : ButtonStyle.Primary)
      .setEmoji(entry.emoji);
    
    currentRow.addComponents(btn);

    if ((i + 1) % 5 === 0 || i === buttonEntries.length - 1) {
      if (currentRow.components.length > 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    }
  }

  // 2. ถ้ามีเหลือ ใส่ใน Dropdown (แถวที่ 5)
  if (remainingEntries.length > 0 && rows.length < 5) {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
    
    const options = remainingEntries.map(entry => 
      new StringSelectMenuOptionBuilder()
        .setLabel(entry.label)
        .setValue(`${entry.type}:${entry.id}`)
        .setEmoji(entry.emoji)
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId('lb_more_items')
      .setPlaceholder('📦 เลือกรายการเพิ่มเติมที่นี่...')
      .addOptions(options);

    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  return rows;
}



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
    const { embed } = await buildBoardEmbed(round);
    const components = await buildBoardButtons(round);

    console.log('📤 Sending message to Discord...');
    const msg = await channel.send({ embeds: [embed], components });
    console.log('✅ Live board sent, message ID:', msg.id);

    // เก็บ message ID ไว้ใน DB
    await db.saveRoundBoardMessage(round.id, channelId, msg.id);
    return msg;
  } catch (err) {
    console.error('❌ Failed to send live board:', err);
    return null;
  }
}

/**
 * Edit Live Board message เมื่อมีการจอง
 */
async function updateLiveBoard(client, roundId) {
  console.log('🔄 updateLiveBoard started | Round:', roundId);
  try {
    const boardInfo = await db.getRoundBoardMessage(roundId);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) {
      console.log('ℹ️ No live board message found for this round. Skipping update.');
      return;
    }

    const round = await db.getCurrentRound();
    if (!round) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id);
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(boardInfo.board_message_id);
    if (!msg) return;

    const { embed } = await buildBoardEmbed(round);
    const components = await buildBoardButtons(round);

    await msg.edit({ embeds: [embed], components });
    console.log('✅ Live board updated');
  } catch (err) {
    console.error('❌ Failed to update live board:', err);
  }
}

/**
 * Edit Live Board ตอนปิดรอบ — แสดงสรุปและลบ buttons
 */
async function closeLiveBoard(client, round) {
  console.log('🏁 closeLiveBoard started | Round:', round.id);
  try {
    const boardInfo = await db.getRoundBoardMessage(round.id);
    console.log('🔍 Board Info from DB:', boardInfo);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) {
      console.warn('⚠️ No board message found for this round');
      return;
    }

    const channel = await client.channels.fetch(boardInfo.board_channel_id);
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(boardInfo.board_message_id);
    if (!msg) {
      console.warn('⚠️ Message not found:', boardInfo.board_message_id);
      return;
    }

    const pages = await db.getAllPages();
    const embed = new EmbedBuilder()
      .setTitle(`🛑 ปิดรับจองแล้ว — ${round.name}`)
      .setColor(0xEF4444)
      .setDescription('รอบนี้ปิดรับจองแล้ว ไม่สามารถจองเพิ่มได้')
      .setTimestamp();

    let totalItems = 0, reservedCount = 0;
    const displayPages = pages.slice(0, 25);
    
    for (const page of displayPages) {
      const items = await db.getItemsForPage(page.id, round.id);
      totalItems += items.length;
      const lines = items.map(i => {
        if (i.reserved_by) { 
          reservedCount++; 
          const nameDisplay = i.discord_user_id ? `<@${i.discord_user_id}>` : `**${i.reserved_by}**`;
          return `~~${i.position}. ${d(i.item_type)}~~ 👤 ${nameDisplay}`; 
        }
        return `${i.position}. ${d(i.item_type)} ❌ ไม่มีคนจอง`;
      });
      embed.addFields({ name: `📄 หน้า ${page.name}`, value: lines.join('\n') || '-', inline: true });
    }

    // รวมสถิติหน้าที่ซ่อนอยู่
    if (pages.length > 25) {
      const hiddenPages = pages.slice(25);
      for (const page of hiddenPages) {
        const items = await db.getItemsForPage(page.id, round.id);
        totalItems += items.length;
        reservedCount += items.filter(i => i.reserved_by).length;
      }
      embed.setDescription(embed.data.description + `\n*(แสดงผล 25 หน้าจากทั้งหมด ${pages.length} หน้า)*`);
    }

    embed.setFooter({ text: `สรุป: จองแล้ว ${reservedCount}/${totalItems} รายการ` });

    // ลบ buttons ออก
    await msg.edit({ embeds: [embed], components: [] });
  } catch (err) {
    console.error('❌ Failed to close live board:', err.message);
  }
}

module.exports = {
  sendLiveBoard,
  updateLiveBoard,
  closeLiveBoard,
  LB_FEATHER_PREFIX,
  LB_BOOK_PREFIX,
};
