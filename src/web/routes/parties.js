const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

// GET /parties
router.get('/', async (req, res) => {
  try {
    const parties = await db.getAllParties();
    const members = await db.getPartyMembers();
    const whitelist = await db.getAllWhitelist(); // get all members, not just active

    // Group members by party
    const partyMembers = {};
    for (const p of parties) {
      partyMembers[p.id] = [];
    }
    for (const m of members) {
      if (partyMembers[m.party_id]) {
        partyMembers[m.party_id].push(m);
      }
    }

    const assignedIds = new Set(members.map(m => m.whitelist_id));
    const availableWhitelist = whitelist.filter(user => !assignedIds.has(user.id));

    res.render('parties', { parties, partyMembers, whitelist: availableWhitelist });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading parties');
  }
});

// POST /parties/:partyId/add
router.post('/:partyId/add', async (req, res) => {
  try {
    const partyId = parseInt(req.params.partyId);
    const { whitelist_id } = req.body;
    
    if (!whitelist_id) {
      req.session.error_msg = 'กรุณาเลือกสมาชิก';
      return res.redirect('/parties');
    }

    // Check limit? (Optional, admin can manage)
    await db.addMemberToParty(partyId, parseInt(whitelist_id));
    req.session.success_msg = 'เพิ่มสมาชิกลงปาร์ตี้สำเร็จ';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการเพิ่มสมาชิก';
  }
  res.redirect('/parties');
});

// POST /parties/:partyId/remove/:whitelistId
router.post('/:partyId/remove/:whitelistId', async (req, res) => {
  try {
    const partyId = parseInt(req.params.partyId);
    const whitelistId = parseInt(req.params.whitelistId);
    
    await db.removeMemberFromParty(partyId, whitelistId);
    req.session.success_msg = 'ลบสมาชิกออกจากปาร์ตี้สำเร็จ';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบสมาชิก';
  }
  res.redirect('/parties');
});

module.exports = router;
