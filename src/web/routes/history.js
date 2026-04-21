const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

// GET /history
router.get('/', async (req, res) => {
  try {
    const history = await db.getHistoryByRound();
    res.render('history', { history });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading history');
  }
});

// GET /history/:roundId
router.get('/:roundId', async (req, res) => {
  const roundId = req.params.roundId;
  try {
    const snapshot = await db.getRoundHistoryItems(roundId);
    const history = await db.getHistoryByRound();
    const round = history.find(h => h.id == roundId);
    
    if (!round) {
      req.session.error_msg = 'ไม่พบข้อมูลรอบที่ระบุ';
      return res.redirect('/history');
    }

    res.render('history_detail', { round, reservations: snapshot });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading history detail');
  }
});

// POST /history/:roundId/delete
router.post('/:roundId/delete', async (req, res) => {
  try {
    await db.deleteRoundHistory(req.params.roundId);
    req.session.success_msg = 'ลบประวัติของรอบสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบประวัติ';
  }
  res.redirect('/history');
});

// POST /history/delete-all
router.post('/delete-all', async (req, res) => {
  try {
    await db.deleteAllHistory();
    req.session.success_msg = 'ลบประวัติทั้งหมดสำเร็จ';
  } catch (err) {
    req.session.error_msg = 'เกิดข้อผิดพลาดในการลบประวัติทั้งหมด';
  }
  res.redirect('/history');
});

module.exports = router;
