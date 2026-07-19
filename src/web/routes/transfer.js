const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../../db/queries');
const database = require('../../db/database');
const { ensureMemberAuthenticated } = require('../middleware/auth');
const discordClient = require('../../bot/client');
const config = require('../../config');

function formatItemsList(items) {
  const groups = {};
  for (const item of items) {
    const key = `${item.page_name}||${item.item_type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const result = [];
  for (const key of Object.keys(groups)) {
    const [pageName, itemType] = key.split('||');
    const groupItems = groups[key];
    groupItems.sort((a, b) => a.position - b.position);
    if (groupItems.length === 4) {
      result.push(`[${pageName}] ${itemType} (ทั้งหน้า)`);
    } else {
      for (const item of groupItems) {
        result.push(`[${item.page_name}] ${item.item_type} #${item.position}`);
      }
    }
  }
  return result.join(', ');
}

// Require the member check middleware for all transfer routes
router.use(ensureMemberAuthenticated);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Config disk storage for files (QRs and Slips)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const prefix = file.fieldname === 'payment_qr' ? 'payment-qr-' : 'slip-';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, prefix + uniqueSuffix + ext);
  }
});

const uploadDisk = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for QR Code!'), false);
    }
  }
});

// Set up multer for memory storage of uploaded slips (not saved to server disk)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for payment slip!'), false);
    }
  }
});

// ─── GET /transfer/send ──────────────────────────────────────────────────────
router.get('/send', async (req, res) => {
  try {
    const currentRound = await db.getOrCreateCurrentRound();
    
    // Get sender's current reservations in this round
    const allReservations = await db.getReservationsByRound(currentRound.id);
    const myReservations = allReservations.filter(r => r.discord_user_id === req.user.discord_user_id);

    // Fetch details of items for my reservations
    const myReservedItems = [];
    for (const resv of myReservations) {
      const item = await db.getItemById(resv.item_id);
      if (item) {
        // check if this item is already in a pending transfer
        // to prevent double offering the same item
        const pendingTransfers = await database.all(
          "SELECT item_ids FROM transfers WHERE status = 'pending'"
        );
        let isAlreadyPending = false;
        for (const t of pendingTransfers) {
          const ids = JSON.parse(t.item_ids || '[]');
          if (ids.includes(item.id)) {
            isAlreadyPending = true;
            break;
          }
        }
        
        if (!isAlreadyPending) {
          myReservedItems.push({
            reservation_id: resv.id,
            item_id: item.id,
            item_type: item.item_type,
            page_name: item.page_name || 'General',
            position: item.position
          });
        }
      }
    }

    // Sort myReservedItems by page name and position ascending
    myReservedItems.sort((a, b) => {
      const pageCompare = (a.page_name || '').localeCompare(b.page_name || '', undefined, { numeric: true, sensitivity: 'base' });
      if (pageCompare !== 0) return pageCompare;
      return (a.position || 0) - (b.position || 0);
    });

    // Get all whitelisted members for the recipient dropdown (extremely fast & doesn't block request)
    const whitelist = await db.getAllWhitelist();
    const members = whitelist.map(w => ({
      id: w.discord_user_id,
      name: w.discord_username
    })).filter(m => m.id !== req.user.discord_user_id)
       .sort((a, b) => a.name.localeCompare(b.name));

    // Get active pending transfers sent by me
    const pendingSent = await db.getPendingTransfersForSender(req.user.discord_user_id);

    // Fetch last used payment details by this user to pre-fill payment info
    let lastPayment = null;
    try {
      lastPayment = await database.get(
        `SELECT bank_name, bank_account_number, bank_account_name, promptpay_id, promptpay_name, payment_qr_url
         FROM transfers
         WHERE sender_id = ?
         ORDER BY id DESC LIMIT 1`,
        [req.user.discord_user_id]
      );
    } catch (dbErr) {
      console.warn('Failed to fetch last payment details:', dbErr.message);
    }

    // Get transfer history for this user as sender
    const allHistory = await db.getTransferHistoryForUser(req.user.discord_user_id);
    const history = allHistory.filter(log => log.sender_id === req.user.discord_user_id);

    res.render('transfer/send', {
      myReservedItems,
      members,
      pendingSent,
      currentRound,
      lastPayment: lastPayment || {},
      history
    });
  } catch (err) {
    console.error('Error loading send transfer page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── POST /transfer/send ─────────────────────────────────────────────────────
router.post('/send', uploadDisk.single('payment_qr'), async (req, res) => {
  const { recipient_id, bank_name, bank_account_number, bank_account_name, promptpay_id, promptpay_name } = req.body;
  let itemIds = req.body.item_ids;

  // Extract raw Discord ID from "Name (ID)" format if present, otherwise use raw text
  const match = recipient_id ? recipient_id.match(/\((\d+)\)$/) : null;
  const actualRecipientId = match ? match[1] : (recipient_id ? recipient_id.trim() : null);

  if (!itemIds || !actualRecipientId) {
    req.session.error_msg = 'กรุณากรอกข้อมูลให้ครบถ้วน (เลือกไอเทมและผู้รับ)';
    return res.redirect('/transfer/send');
  }

  if (!Array.isArray(itemIds)) {
    itemIds = [itemIds];
  }
  itemIds = itemIds.map(id => parseInt(id)).filter(id => !isNaN(id));

  if (itemIds.length === 0) {
    req.session.error_msg = 'กรุณาเลือกไอเทมอย่างน้อย 1 ชิ้น';
    return res.redirect('/transfer/send');
  }

  // Fetch last used payment details for verification fallback
  let lastPayment = null;
  try {
    lastPayment = await database.get(
      `SELECT bank_name, bank_account_number, bank_account_name, promptpay_id, promptpay_name, payment_qr_url
       FROM transfers
       WHERE sender_id = ?
       ORDER BY id DESC LIMIT 1`,
      [req.user.discord_user_id]
    );
  } catch (dbErr) {
    console.warn('Failed to fetch last payment details for fallback:', dbErr.message);
  }

  const hasBank = bank_name && bank_account_number && bank_account_name;
  const hasQR = req.file || (lastPayment && lastPayment.payment_qr_url);
  const hasPromptPay = promptpay_id;

  if (!hasBank && !hasQR && !hasPromptPay) {
    req.session.error_msg = 'กรุณากรอกช่องทางการชำระเงินอย่างน้อย 1 ช่องทาง (บัญชีธนาคาร, รูปภาพ QR หรือ PromptPay)';
    return res.redirect('/transfer/send');
  }

  try {
    const currentRound = await db.getOrCreateCurrentRound();

    // Verify all selected items belong to sender
    const allReservations = await db.getReservationsByRound(currentRound.id);
    const myReservations = allReservations.filter(r => r.discord_user_id === req.user.discord_user_id);
    const myReservedItemIds = myReservations.map(r => r.item_id);

    const allOwned = itemIds.every(id => myReservedItemIds.includes(id));
    if (!allOwned) {
      req.session.error_msg = 'คุณไม่ได้สิทธิ์จองบางไอเทมที่เลือก หรือรอบนี้ไม่มีไอเทมนั้นแล้ว';
      return res.redirect('/transfer/send');
    }

    // Fetch recipient name
    let recipientName = 'Unknown User';
    try {
      const guild = await discordClient.guilds.fetch(config.discordGuildId);
      const member = await guild.members.fetch(actualRecipientId);
      if (member) {
        recipientName = member.nickname || member.displayName || member.user.username;
      }
    } catch (err) {
      console.warn('Failed to fetch recipient nickname from guild, using whitelist fallback:', err.message);
      const wl = await db.getAllWhitelist();
      const userWl = wl.find(w => w.discord_user_id === actualRecipientId);
      if (userWl) {
        recipientName = userWl.discord_username;
      } else {
        recipientName = actualRecipientId;
      }
    }

    let qrUrl = null;
    if (req.file) {
      qrUrl = '/uploads/' + req.file.filename;
    } else if (lastPayment && lastPayment.payment_qr_url) {
      qrUrl = lastPayment.payment_qr_url;
    }

    // Save transfer offer
    await db.createTransfer(
      currentRound.id,
      itemIds,
      req.user.discord_user_id,
      req.user.server_name || req.user.discord_username || 'Unknown',
      actualRecipientId,
      recipientName,
      bank_name || null,
      bank_account_number || null,
      bank_account_name || null,
      qrUrl,
      promptpay_id || null,
      promptpay_name || null
    );

    // Notify recipient via Discord DM (Asynchronously in background)
    (async () => {
      try {
        if (discordClient.isReady()) {
          const recipientUser = await discordClient.users.fetch(actualRecipientId);
          if (recipientUser) {
            const senderName = req.user.server_name || req.user.discord_username;
            
            const selectedItems = [];
            for (const id of itemIds) {
              const item = await db.getItemById(id);
              if (item) {
                selectedItems.push(item);
              }
            }
            const itemsStr = formatItemsList(selectedItems);
            const baseUrl = req.protocol + '://' + req.get('host');
            
            await recipientUser.send(
              `🔔 **มีคำเสนอโอนสิทธิ์จองไอเทมใหม่ถึงคุณ**\n` +
              `- **จาก:** ${senderName}\n` +
              `- **ไอเทม:** ${itemsStr}\n` +
              `โปรดล็อกอินเข้าสู่หน้าเว็บเพื่อตรวจสอบและยืนยันชำระเงินได้ที่นี่: ${baseUrl}/transfer/receive`
            );
          }
        }
      } catch (dmErr) {
        console.warn('Could not send DM to recipient in background:', dmErr.message);
      }
    })();

    req.session.success_msg = 'สร้างคำเสนอโอนสำเร็จแล้ว! ข้อมูลจะไปแสดงที่หน้าผู้รับทันที';
    res.redirect('/transfer/send');
  } catch (err) {
    console.error('Error creating transfer:', err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการสร้างคำขอโอน: ' + err.message;
    res.redirect('/transfer/send');
  }
});

// ─── GET /transfer/receive ───────────────────────────────────────────────────
router.get('/receive', async (req, res) => {
  try {
    const currentRound = await db.getOrCreateCurrentRound();
    const pendingTransfers = await db.getPendingTransfersForRecipient(req.user.discord_user_id);
    const history = await db.getTransferHistoryForUser(req.user.discord_user_id);
    const activeReservationsCount = await db.getUserActiveReservationsCount(req.user.discord_user_id, currentRound.id);

    res.render('transfer/receive', {
      pendingTransfers,
      history,
      currentRound,
      activeReservationsCount
    });
  } catch (err) {
    console.error('Error loading receive transfer page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── POST /transfer/claim/:id ────────────────────────────────────────────────
router.post('/claim/:id', uploadDisk.single('slip'), async (req, res) => {
  const transferId = parseInt(req.params.id);
  const { amount } = req.body;
  let selectedItemIds = req.body.item_ids;

  if (selectedItemIds) {
    if (!Array.isArray(selectedItemIds)) {
      selectedItemIds = [selectedItemIds];
    }
    selectedItemIds = selectedItemIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  }

  if (selectedItemIds && selectedItemIds.length === 0) {
    req.session.error_msg = 'กรุณาเลือกไอเทมอย่างน้อย 1 ชิ้นที่จะรับโอน';
    return res.redirect('/transfer/receive');
  }

  let parsedAmount = 0;
  if (amount && amount.trim() !== '') {
    parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      req.session.error_msg = 'กรุณากรอกยอดเงินโอนให้ถูกต้อง (ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0)';
      return res.redirect('/transfer/receive');
    }
  }

  try {
    const transfer = await db.getTransferById(transferId);
    if (!transfer) {
      req.session.error_msg = 'ไม่พบคำขอโอนนี้ หรือข้อมูลอาจจะถูกยกเลิกแล้ว';
      return res.redirect('/transfer/receive');
    }

    if (transfer.recipient_id !== req.user.discord_user_id) {
      req.session.error_msg = 'คุณไม่มีสิทธิ์ในการรับโอนรายการนี้';
      return res.redirect('/transfer/receive');
    }

    if (transfer.status !== 'pending') {
      req.session.error_msg = 'รายการโอนนี้ไม่ได้อยู่ในสถานะรอชำระเงิน (อาจโอนเสร็จหรือยกเลิกแล้ว)';
      return res.redirect('/transfer/receive');
    }

    // Quota limits for Album/Illusion Box (max 1 per round)
    if (transfer.item_type === 'Album' || transfer.item_type === 'Illution Box') {
      const myReservations = await db.getCurrentReservations();
      const hasAlbumResv = myReservations.some(r => 
        r.discord_user_id === req.user.discord_user_id && 
        (r.item_type === 'Album' || r.item_type === 'Illution Box')
      );
      
      if (hasAlbumResv) {
        req.session.error_msg = 'คุณมีสิทธิ์จอง Album/Illution Box ในรอบนี้แล้วชิ้นหนึ่ง (จำกัดคนละ 1 ชิ้น)';
        return res.redirect('/transfer/receive');
      }
    }

    // Save slip locally on disk if uploaded, otherwise null
    const slipUrl = req.file ? ('/uploads/' + req.file.filename) : null;
    const recipientName = req.user.server_name || req.user.discord_username || 'Unknown';

    // Complete transfer in database instantly!
    await db.completeTransfer(
      transferId,
      req.user.discord_user_id,
      recipientName,
      parsedAmount,
      slipUrl,
      selectedItemIds
    );

    // Background tasks (Discord DM notifications, Announcements & Live Board updates)
    (async () => {
      if (discordClient.isReady()) {
        try {
          const senderUser = await discordClient.users.fetch(transfer.sender_id);
          
          const finalItemIds = selectedItemIds && selectedItemIds.length > 0 ? selectedItemIds : JSON.parse(transfer.item_ids || '[]');
          const selectedItems = transfer.items.filter(item => finalItemIds.includes(item.id));
          const itemsStr = formatItemsList(selectedItems);

          const msgContent = 
            `🎉 **ยืนยันการรับโอนไอเทมสำเร็จ!**\n` +
            `- **ไอเทม:** ${itemsStr}\n` +
            `- **ผู้รับ:** ${recipientName} (${req.user.discord_username})\n` +
            `- **จำนวนเงินโอน:** **${parsedAmount.toLocaleString()} บาท**\n` +
            (req.file ? `โปรดตรวจสอบยอดเงินที่โอนเข้ามาในบัญชีของคุณโดยดูหลักฐานสลิปแนบด้านล่างนี้` : `⚠️ *ผู้รับเลือกรับสิทธิ์และจะชำระเงินตามมาภายหลัง (ยังไม่มีการแนบสลิป)*`);

          const dmOptions = { content: msgContent };
          if (req.file) {
            dmOptions.files = [{ attachment: req.file.path, name: req.file.filename }];
          }

          // Send DM to sender in background
          if (senderUser) {
            await senderUser.send(dmOptions);
          }

          // Log to transfer log channel in background (if configured)
          const logChannelId = process.env.DISCORD_TRANSFER_LOG_CHANNEL_ID || process.env.DISCORD_LOG_CHANNEL_ID;
          if (logChannelId) {
            const channel = await discordClient.channels.fetch(logChannelId);
            if (channel) {
              const announceOptions = {
                content: `🔄 **[โอนสิทธิ์สำเร็จ]** ${transfer.sender_name} ได้โอนสิทธิ์จอง **${itemsStr}** ให้กับ ${recipientName} ` +
                  (req.file ? `(ชำระเงิน ${parsedAmount.toLocaleString()} บาท)` : `(รับสิทธิ์แล้ว/รอชำระเงินตามมาภายหลัง)`)
              };
              if (req.file) {
                announceOptions.files = [{ attachment: req.file.path, name: req.file.filename }];
              }
              await channel.send(announceOptions);
            }
          }
        } catch (discordErr) {
          console.error('Failed to notify via Discord in background:', discordErr.message);
        }
      }

      // Update Live Board in background
      try {
        const currentRound = await db.getOrCreateCurrentRound();
        if (discordClient.isReady() && currentRound.board_channel_id && currentRound.board_message_id) {
          const { updateLiveBoard } = require('../../bot/liveboard');
          await updateLiveBoard(discordClient, currentRound.id);
        }
      } catch (lbErr) {
        console.error('Failed to update live board after transfer in background:', lbErr.message);
      }
    })();

    req.session.success_msg = 'รับโอนสิทธิ์และแจ้งยอดพร้อมสลิปไปยังผู้ส่งเรียบร้อยแล้ว!';
    res.redirect('/transfer/receive');
  } catch (err) {
    console.error('Error claiming transfer:', err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการโอนสิทธิ์: ' + err.message;
    res.redirect('/transfer/receive');
  }
});

// ─── POST /transfer/cancel/:id ───────────────────────────────────────────────
router.post('/cancel/:id', async (req, res) => {
  const transferId = parseInt(req.params.id);

  try {
    const transfer = await db.getTransferById(transferId);
    if (!transfer) {
      req.session.error_msg = 'ไม่พบรายการโอนนี้';
      return res.redirect('/transfer/send');
    }

    if (transfer.sender_id !== req.user.discord_user_id) {
      req.session.error_msg = 'คุณไม่มีสิทธิ์ยกเลิกรายการนี้';
      return res.redirect('/transfer/send');
    }

    if (transfer.status !== 'pending') {
      req.session.error_msg = 'รายการโอนไม่ได้อยู่ในสถานะที่สามารถยกเลิกได้';
      return res.redirect('/transfer/send');
    }

    // Delete static payment QR image file if it exists
    if (transfer.payment_qr_url) {
      const qrPath = path.join(__dirname, '../public', transfer.payment_qr_url);
      if (fs.existsSync(qrPath)) {
        try {
          fs.unlinkSync(qrPath);
        } catch (unlinkErr) {
          console.warn('Failed to delete QR image file:', unlinkErr.message);
        }
      }
    }

    await db.cancelTransfer(transferId, req.user.discord_user_id);

    req.session.success_msg = 'ยกเลิกคำเสนอโอนสำเร็จแล้ว!';
    res.redirect('/transfer/send');
  } catch (err) {
    console.error('Error cancelling transfer:', err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการยกเลิกคำขอโอน: ' + err.message;
    res.redirect('/transfer/send');
  }
});

// ─── POST /transfer/upload-slip-retroactive/:logId ───────────────────────────
router.post('/upload-slip-retroactive/:logId', uploadDisk.single('slip'), async (req, res) => {
  const logId = parseInt(req.params.logId);
  const { amount } = req.body;

  if (!req.file) {
    req.session.error_msg = 'กรุณาอัปโหลดรูปภาพสลิปโอนเงิน';
    return res.redirect('/transfer/receive');
  }

  let parsedAmount = 0;
  if (amount && amount.trim() !== '') {
    parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      req.session.error_msg = 'กรุณากรอกยอดเงินโอนให้ถูกต้อง (ต้องเป็นตัวเลขมากกว่า 0)';
      return res.redirect('/transfer/receive');
    }
  } else {
    req.session.error_msg = 'กรุณากรอกยอดเงินโอนจริง';
    return res.redirect('/transfer/receive');
  }

  try {
    const log = await db.getTransferLogById(logId);
    if (!log) {
      req.session.error_msg = 'ไม่พบประวัติรายการโอนนี้';
      return res.redirect('/transfer/receive');
    }

    if (log.recipient_id !== req.user.discord_user_id) {
      req.session.error_msg = 'คุณไม่มีสิทธิ์ในการแก้ไขสลิปของประวัตินี้';
      return res.redirect('/transfer/receive');
    }

    if (log.slip_url) {
      req.session.error_msg = 'รายการนี้มีการแนบสลิปไปแล้ว ไม่สามารถเปลี่ยนสลิปซ้ำได้';
      return res.redirect('/transfer/receive');
    }

    const slipUrl = '/uploads/' + req.file.filename;

    // Update log in database
    await db.updateRetroactiveSlip(logId, req.user.discord_user_id, parsedAmount, slipUrl);

    // Notify via Discord
    (async () => {
      if (discordClient.isReady()) {
        try {
          const senderUser = await discordClient.users.fetch(log.sender_id);
          const recipientName = req.user.server_name || req.user.discord_username || 'Unknown';

          const msgContent = 
            `📬 **มีการแนบหลักฐานสลิปโอนเงินย้อนหลัง!**\n` +
            `- **ไอเทม:** ${log.item_names}\n` +
            `- **ผู้รับ/ผู้โอนเงิน:** ${recipientName} (${req.user.discord_username})\n` +
            `- **ยอดเงินโอน:** **${parsedAmount.toLocaleString()} บาท**\n` +
            `โปรดตรวจสอบความถูกต้องของสลิปโอนเงินย้อนหลังตามไฟล์แนบด้านล่างนี้`;

          // Send DM to sender in background
          if (senderUser) {
            await senderUser.send({
              content: msgContent,
              files: [{ attachment: req.file.path, name: req.file.filename }]
            });
          }

          // Log to transfer log channel in background (if configured)
          const logChannelId = process.env.DISCORD_TRANSFER_LOG_CHANNEL_ID || process.env.DISCORD_LOG_CHANNEL_ID;
          if (logChannelId) {
            const channel = await discordClient.channels.fetch(logChannelId);
            if (channel) {
              await channel.send({
                content: `🔄 **[แนบสลิปย้อนหลังสำเร็จ]** ${recipientName} ได้ส่งหลักฐานการโอนเงินจำนวน **${parsedAmount.toLocaleString()} บาท** สำหรับการโอนสิทธิ์ **${log.item_names}** จาก ${log.sender_name}`,
                files: [{ attachment: req.file.path, name: req.file.filename }]
              });
            }
          }
        } catch (discordErr) {
          console.error('Failed to send retroactive slip Discord notifications:', discordErr.message);
        }
      }
    })();

    req.session.success_msg = 'แนบหลักฐานสลิปโอนเงินย้อนหลังเรียบร้อยแล้ว!';
    res.redirect('/transfer/receive');
  } catch (err) {
    console.error('Error uploading retroactive slip:', err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการแนบสลิป: ' + err.message;
    res.redirect('/transfer/receive');
  }
});

module.exports = router;
