const express = require('express');
const router = express.Router();
const db = require('../../db/queries');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /presets - List all presets
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const presets = await db.getAllPresets();
    res.render('presets', { presets });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
});

// POST /presets/add
router.post('/add', ensureAuthenticated, async (req, res) => {
  try {
    const { name, album, box, ld, ts } = req.body;
    await db.addPreset(name, parseInt(album) || 0, parseInt(box) || 0, parseInt(ld) || 0, parseInt(ts) || 0);
    req.session.success_msg = `Preset "${name}" created successfully!`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Error creating preset';
  }
  res.redirect('/presets');
});

// POST /presets/edit/:id - Fixed Edit Route
router.post('/edit/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, album, box, ld, ts } = req.body;
    
    if (!id) throw new Error('No preset ID provided');

    await db.updatePreset(
      id, 
      name, 
      parseInt(album) || 0, 
      parseInt(box) || 0, 
      parseInt(ld) || 0, 
      parseInt(ts) || 0
    );
    
    req.session.success_msg = `Preset "${name}" updated successfully!`;
  } catch (err) {
    console.error('❌ Update Preset Error:', err);
    req.session.error_msg = 'Error updating preset: ' + err.message;
  }
  res.redirect('/presets');
});

// POST /presets/delete/:id
router.post('/delete/:id', ensureAuthenticated, async (req, res) => {
  try {
    await db.deletePreset(req.params.id);
    req.session.success_msg = 'Preset deleted successfully!';
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Delete failed';
  }
  res.redirect('/presets');
});

// POST /presets/apply/:id - THE MAGIC BUTTON
router.post('/apply/:id', ensureAuthenticated, async (req, res) => {
  try {
    const preset = await db.getPresetById(req.params.id);
    if (!preset) throw new Error('Preset not found');

    const round = await db.getOrCreateCurrentRound();
    if (round.status !== 'preparing') {
      req.session.error_msg = 'Please close the previous round first or ensure the status is Preparing.';
      return res.redirect('/');
    }

    // Create queue: Album → Illution Box → Light-Dark → Time-Space
    const queue = [];
    for (let i = 0; i < preset.album_count;      i++) queue.push('Album');
    for (let i = 0; i < (preset.illution_box_count || 0); i++) queue.push('Illution Box');
    for (let i = 0; i < preset.light_dark_count; i++) queue.push('Light-Dark');
    for (let i = 0; i < preset.time_space_count; i++) queue.push('Time-Space');

    if (queue.length === 0) {
      req.session.error_msg = 'This preset has no items';
      return res.redirect('/');
    }

    const numPages = Math.ceil(queue.length / 4);
    for (let p = 1; p <= numPages; p++) {
      const pageId = await db.addPage(p.toString());
      for (let pos = 1; pos <= 4; pos++) {
        if (queue.length === 0) break;
        await db.addItem(pageId, queue.shift(), pos);
      }
    }

    // Calculate default quotas: LD/9, TS/10 (floor, min 1)
    const defaultQuotaLd = Math.max(1, Math.floor(preset.light_dark_count / 9));
    const defaultQuotaTs = Math.max(1, Math.floor(preset.time_space_count / 10));
    await db.updateRoundQuota(round.id, 'ld', defaultQuotaLd);
    await db.updateRoundQuota(round.id, 'ts', defaultQuotaTs);

    req.session.success_msg = `Applied Preset "${preset.name}": Created ${numPages} pages. Default Quotas: LD=${defaultQuotaLd}, TS=${defaultQuotaTs}`;
  } catch (err) {
    console.error(err);
    req.session.error_msg = 'Error applying preset';
  }
  res.redirect('/');
});

module.exports = router;
