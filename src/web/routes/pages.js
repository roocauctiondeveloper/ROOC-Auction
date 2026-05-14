const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

router.use(ensureAuthenticated);

// GET /pages
router.get('/', async (req, res) => {
  try {
    const pages = await db.getAllPages();
    res.render('pages', { pages });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading pages');
  }
});

// POST /pages
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    req.session.error_msg = 'Please provide a Page name';
    return res.redirect('/pages');
  }
  
  try {
    await db.addPage(name);
    req.session.success_msg = 'Page added successfully';
  } catch (err) {
    req.session.error_msg = 'Error adding page';
  }
  res.redirect('/pages');
});

// POST /pages/bulk-setup (Wipe & Reset)
router.post('/bulk-setup', async (req, res) => {
  const { card_total, box_total, white_total, black_total } = req.body;
  
  const nCard = parseInt(card_total) || 0;
  const nBox = parseInt(box_total) || 0;
  const nWhite = parseInt(white_total) || 0;
  const nBlack = parseInt(black_total) || 0;
  
  const totalItems = nCard + nBox + nWhite + nBlack;
  if (totalItems === 0) {
    req.session.error_msg = 'Please specify at least 1 item';
    return res.redirect('/pages');
  }

  try {
    await db.deleteAllPages(); 

    const allItemsList = [];
    for (let i = 0; i < nCard; i++) allItemsList.push('Album');
    for (let i = 0; i < nBox; i++) allItemsList.push('Illution Box');
    for (let i = 0; i < nWhite; i++) allItemsList.push('Light-Dark');
    for (let i = 0; i < nBlack; i++) allItemsList.push('Time-Space');

    const numPages = Math.ceil(totalItems / 4);
    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString());
      for (let pos = 1; pos <= 4; pos++) {
        if (allItemsList.length === 0) break;
        await db.addItem(pageId, allItemsList.shift(), pos);
      }
    }
    
    req.session.success_msg = `Setup completed: ${numPages} pages and ${totalItems} items created.`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Error during Bulk Setup';
  }
  res.redirect('/pages');
});

// POST /pages/bulk-add (Inject & Re-sort)
router.post('/bulk-add', async (req, res) => {
  const { card_add, box_add, white_add, black_add } = req.body;
  
  const nCardAdd = parseInt(card_add) || 0;
  const nBoxAdd = parseInt(box_add) || 0;
  const nWhiteAdd = parseInt(white_add) || 0;
  const nBlackAdd = parseInt(black_add) || 0;

  try {
    const round = await db.getOrCreateCurrentRound();
    const allData = await db.getAllBoardData(round.id);
    
    let nCard = nCardAdd;
    let nBox = nBoxAdd;
    let nWhite = nWhiteAdd;
    let nBlack = nBlackAdd;

    // Count existing items
    for (const item of allData) {
      const type = item.item_type.toLowerCase();
      if (type === 'album') nCard++;
      else if (type === 'illution box' || type === 'illution-box') nBox++;
      else if (type === 'light-dark') nWhite++;
      else if (type === 'time-space') nBlack++;
    }

    const totalItems = nCard + nBox + nWhite + nBlack;
    if (totalItems === 0) {
      req.session.error_msg = 'No items to add';
      return res.redirect('/pages');
    }

    // Wipe and Re-distribute in correct order
    await db.deleteAllPages();
    const queue = [];
    for (let i = 0; i < nCard; i++) queue.push('Album');
    for (let i = 0; i < nBox; i++) queue.push('Illution Box');
    for (let i = 0; i < nWhite; i++) queue.push('Light-Dark');
    for (let i = 0; i < nBlack; i++) queue.push('Time-Space');

    const numPages = Math.ceil(queue.length / 4);
    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString());
      for (let pos = 1; pos <= 4; pos++) {
        if (queue.length === 0) break;
        await db.addItem(pageId, queue.shift(), pos);
      }
    }
    
    req.session.success_msg = `Injection successful: Total inventory updated to ${totalItems} items across ${numPages} pages.`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Error during item injection';
  }
  res.redirect('/pages');
});

// POST /pages/:id/delete
router.post('/:id/delete', async (req, res) => {
  try {
    await db.deletePage(req.params.id);
    req.session.success_msg = 'Page deleted successfully';
  } catch (err) {
    req.session.error_msg = 'Error deleting page';
  }
  res.redirect('/pages');
});

// POST /pages/delete-all
router.post('/delete-all', async (req, res) => {
  try {
    await db.deleteAllPages();
    req.session.success_msg = 'All pages and items cleared successfully';
  } catch (err) {
    req.session.error_msg = 'Error clearing data';
  }
  const redirectUrl = req.query.redirect || '/pages';
  res.redirect(redirectUrl);
});

// POST /pages/multiply
router.post('/multiply', async (req, res) => {
  const { percentage } = req.body;
  const pct = parseInt(percentage);

  if (!pct || pct <= 0) {
    req.session.error_msg = 'Percentage must be greater than 0';
    return res.redirect('/');
  }

  try {
    const round = await db.getOrCreateCurrentRound();
    if (round.status !== 'preparing') {
      req.session.error_msg = 'Boosting is only available during the Preparing phase';
      return res.redirect('/');
    }

    const allData = await db.getAllBoardData(round.id);
    let currentAlbum = 0;
    let currentBox = 0;
    let currentLD = 0;
    let currentTS = 0;

    for (const item of allData) {
      const type = item.item_type.toLowerCase();
      if (type === 'album') currentAlbum++;
      else if (type === 'illution box' || type === 'illution-box') currentBox++;
      else if (type === 'light-dark') currentLD++;
      else if (type === 'time-space') currentTS++;
    }

    const addAlbum = Math.floor(currentAlbum * (pct / 100));
    const addBox = Math.floor(currentBox * (pct / 100));
    const addLD = Math.floor(currentLD * (pct / 100));
    const addTS = Math.floor(currentTS * (pct / 100));

    if (addAlbum === 0 && addBox === 0 && addLD === 0 && addTS === 0) {
      req.session.error_msg = 'No items added (Current count too low for calculation)';
      return res.redirect('/');
    }

    await db.deleteAllPages();

    const queue = [];
    const totalAlbum = currentAlbum + addAlbum;
    const totalBox = currentBox + addBox;
    const totalLD = currentLD + addLD;
    const totalTS = currentTS + addTS;

    for (let i = 0; i < totalAlbum; i++) queue.push('Album');
    for (let i = 0; i < totalBox; i++) queue.push('Illution Box');
    for (let i = 0; i < totalLD; i++) queue.push('Light-Dark');
    for (let i = 0; i < totalTS; i++) queue.push('Time-Space');

    const numPages = Math.ceil(queue.length / 4);

    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString());
      for (let pos = 1; pos <= 4; pos++) {
        if (queue.length === 0) break;
        await db.addItem(pageId, queue.shift(), pos);
      }
    }

    req.session.success_msg = `Inventory boosted by ${pct}%: Total pages ${numPages}. (+${addAlbum} Albums, +${addBox} Boxes, +${addLD} LD, +${addTS} TS)`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Error occurred during multiplication';
  }
  
  res.redirect('/');
});

module.exports = router;
