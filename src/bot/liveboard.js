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

const DISP = { 'Album': 'Album', 'light-dark': 'Light-Dark', 'time-space': 'Time-Space' };
const d = (t) => DISP[t] ?? t;

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

  for (const page of pages) {
    const items = await db.getItemsForPage(page.id);
    totalItems += items.length;

    const lines = items.map(i => {
      if (i.reserved_by) {
        reservedCount++;
        return `~~${i.position}. ${d(i.item_type)}~~ 👤 **${i.reserved_by}**`;
      }
      return `${i.position}. ${d(i.item_type)} ✅`;
    });

    embed.addFields({
      name: `📄 หน้า ${page.name}`,
      value: lines.join('\n') || '-',
      inline: true,
    });
  }

  const remaining = totalItems - reservedCount;
  embed.setDescription(
    `**${reservedCount}/${totalItems}** จองแล้ว • **${remaining}** ว่างอยู่\n` +
    `พิมพ์ \`/available\` เพื่อดูรายการว่างและจองได้เลย!`
  );
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
    if (item.item_type === 'light-dark' || item.item_type === 'time-space') {
      if (!featherPages.has(item.page_id)) {
        featherPages.set(item.page_id, { page_name: item.page_name, items: [] });
      }
      featherPages.get(item.page_id).items.push(item);
    } else {
      bookItems.push(item);
    }
  }

  const FEATHER_EMOJI = { 'light-dark': '🤍', 'time-space': '❤️' };
  const allButtons = [];

  // Album ก่อน
  for (const item of bookItems.slice(0, 12)) {
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${LB_BOOK_PREFIX}${item.id}`)
        .setLabel(`หน้า ${item.page_name} #${item.position}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📒')
    );
  }

  // ขนนก
  for (const [pageId, { page_name, items }] of [...featherPages.entries()].slice(0, 13)) {
    const types = [...new Set(items.map(i => i.item_type))];
    const emoji = types.length === 1 ? (FEATHER_EMOJI[types[0]] || '🪶') : '🪶';
    allButtons.push(
      new ButtonBuilder()
        .setCustomId(`${LB_FEATHER_PREFIX}${pageId}`)
        .setLabel(`หน้า ${page_name}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji(emoji)
    );
  }

  if (allButtons.length === 0) return [];

  const rows = [];
  for (let i = 0; i < Math.min(allButtons.length, 25); i += 5) {
    rows.push(new ActionRowBuilder().addComponents(allButtons.slice(i, i + 5)));
  }
  return rows;
}

/**
 * ส่ง Live Board message ใหม่ตอนเปิดรอบ
 */
async function sendLiveBoard(client, channelId, round) {
  if (!client.isReady()) {
    console.warn('⚠️ Bot not ready, cannot send live board');
    return null;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;

    const { embed } = await buildBoardEmbed(round);
    const components = await buildBoardButtons(round);

    const msg = await channel.send({ embeds: [embed], components });
    console.log('✅ Live board sent, message ID:', msg.id);

    // เก็บ message ID ไว้ใน DB
    await db.saveRoundBoardMessage(round.id, channelId, msg.id);
    return msg;
  } catch (err) {
    console.error('❌ Failed to send live board:', err.message);
    return null;
  }
}

/**
 * Edit Live Board message เมื่อมีการจอง
 */
async function updateLiveBoard(client, roundId) {
  try {
    const boardInfo = await db.getRoundBoardMessage(roundId);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) return;

    const round = await db.getCurrentRound();
    if (!round) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id);
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(boardInfo.board_message_id);
    if (!msg) return;

    const { embed } = await buildBoardEmbed(round);
    const components = await buildBoardButtons(round);

    await msg.edit({ embeds: [embed], components });
  } catch (err) {
    console.error('❌ Failed to update live board:', err.message);
  }
}

/**
 * Edit Live Board ตอนปิดรอบ — แสดงสรุปและลบ buttons
 */
async function closeLiveBoard(client, round) {
  try {
    const boardInfo = await db.getRoundBoardMessage(round.id);
    if (!boardInfo?.board_message_id || !boardInfo?.board_channel_id) return;

    const channel = await client.channels.fetch(boardInfo.board_channel_id);
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(boardInfo.board_message_id);
    if (!msg) return;

    const pages = await db.getAllPages();
    const embed = new EmbedBuilder()
      .setTitle(`🛑 ปิดรับจองแล้ว — ${round.name}`)
      .setColor(0xEF4444)
      .setDescription('รอบนี้ปิดรับจองแล้ว ไม่สามารถจองเพิ่มได้')
      .setTimestamp();

    let totalItems = 0, reservedCount = 0;
    for (const page of pages) {
      const items = await db.getItemsForPage(page.id);
      totalItems += items.length;
      const lines = items.map(i => {
        if (i.reserved_by) { reservedCount++; return `~~${i.position}. ${d(i.item_type)}~~ 👤 **${i.reserved_by}**`; }
        return `${i.position}. ${d(i.item_type)} ❌ ไม่มีคนจอง`;
      });
      embed.addFields({ name: `📄 หน้า ${page.name}`, value: lines.join('\n') || '-', inline: true });
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
