const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const LandSavings = require('../models/LandSavings');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

/** Normalized JSON + sorted entries (newest first) */
function serializeDoc(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const entries = [...(o.entries || [])]
    .map((e) => ({
      _id: String(e._id),
      amount: Number(e.amount),
      notes: e.notes || '',
      recordedAt: e.recordedAt || o.updatedAt || o.createdAt,
    }))
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  const amountTransferred = entries.reduce((s, e) => s + Number(e.amount), 0);
  return {
    _id: o._id,
    planMonthIndex: o.planMonthIndex,
    amountTransferred,
    entries,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/** Migrate legacy single amount → first history row */
async function migrateLegacyIfNeeded(doc) {
  if (!doc) return doc;
  const hasLegacy =
    doc.amountTransferred != null &&
    !Number.isNaN(Number(doc.amountTransferred)) &&
    (!doc.entries || doc.entries.length === 0);
  if (!hasLegacy) return doc;
  doc.entries.push({
    amount: Number(doc.amountTransferred),
    notes: doc.notes || '',
    recordedAt: doc.updatedAt || doc.createdAt || new Date(),
  });
  doc.amountTransferred = undefined;
  doc.notes = undefined;
  await doc.save();
  return LandSavings.findById(doc._id);
}

// GET /api/land-savings — per-month totals + transfer history
router.get('/', async (req, res) => {
  try {
    const rows = await LandSavings.find({ user: req.user.id }).sort({ planMonthIndex: 1 });
    for (const doc of rows) {
      await migrateLegacyIfNeeded(doc);
    }
    const fresh = await LandSavings.find({ user: req.user.id }).sort({ planMonthIndex: 1 });
    res.json({ success: true, data: fresh.map((d) => serializeDoc(d)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/land-savings/month/:planMonthIndex/entries — append one transfer (history)
router.post(
  '/month/:planMonthIndex/entries',
  [
    body('amount').isFloat({ locale: 'en-US' }).withMessage('amount must be a number'),
    body('notes').optional().trim().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const planMonthIndex = parseInt(req.params.planMonthIndex, 10);
      if (Number.isNaN(planMonthIndex) || planMonthIndex < 1 || planMonthIndex > 24) {
        return res.status(400).json({ success: false, message: 'planMonthIndex must be 1–24' });
      }
      const amount = Number(req.body.amount);
      const notes = req.body.notes != null ? String(req.body.notes).trim() : '';

      let doc = await LandSavings.findOne({ user: req.user.id, planMonthIndex });
      if (!doc) {
        doc = new LandSavings({ user: req.user.id, planMonthIndex, entries: [] });
      } else {
        doc = await migrateLegacyIfNeeded(doc);
      }
      doc.entries.push({ amount, notes, recordedAt: new Date() });
      await doc.save();

      const fresh = await LandSavings.findById(doc._id);
      res.json({ success: true, data: serializeDoc(fresh) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// DELETE /api/land-savings/month/:planMonthIndex/entries/:entryId — remove one row from history
router.delete('/month/:planMonthIndex/entries/:entryId', async (req, res) => {
  try {
    const planMonthIndex = parseInt(req.params.planMonthIndex, 10);
    if (Number.isNaN(planMonthIndex) || planMonthIndex < 1 || planMonthIndex > 24) {
      return res.status(400).json({ success: false, message: 'planMonthIndex must be 1–24' });
    }
    const { entryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json({ success: false, message: 'Invalid entry id' });
    }

    let doc = await LandSavings.findOne({ user: req.user.id, planMonthIndex });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Month not found' });
    }
    doc = await migrateLegacyIfNeeded(doc);

    const oid = new mongoose.Types.ObjectId(entryId);
    const before = doc.entries.length;
    doc.entries.pull({ _id: oid });
    if (doc.entries.length === before) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    if (doc.entries.length === 0) {
      await LandSavings.deleteOne({ _id: doc._id });
      return res.json({ success: true, data: null });
    }

    await doc.save();
    const fresh = await LandSavings.findById(doc._id);
    res.json({ success: true, data: serializeDoc(fresh) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/land-savings/month/:planMonthIndex — remove entire month (all history)
router.delete('/month/:planMonthIndex', async (req, res) => {
  try {
    const planMonthIndex = parseInt(req.params.planMonthIndex, 10);
    if (Number.isNaN(planMonthIndex) || planMonthIndex < 1 || planMonthIndex > 24) {
      return res.status(400).json({ success: false, message: 'planMonthIndex must be 1–24' });
    }
    await LandSavings.deleteOne({ user: req.user.id, planMonthIndex });
    res.json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
