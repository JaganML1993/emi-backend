const express = require('express');
const { body, validationResult } = require('express-validator');
const LandSavings = require('../models/LandSavings');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// GET /api/land-savings — all saved progress for current user (merge with plan on client, or return raw rows)
router.get('/', async (req, res) => {
  try {
    const rows = await LandSavings.find({ user: req.user.id }).sort({ planMonthIndex: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/land-savings/month/:planMonthIndex — upsert recorded transfer for a plan month (1–24)
router.put(
  '/month/:planMonthIndex',
  [
    body('amountTransferred').isFloat({ locale: 'en-US' }).withMessage('amountTransferred must be a number'),
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
      const amountTransferred = Number(req.body.amountTransferred);
      const notes = req.body.notes != null ? String(req.body.notes).trim() : '';

      const doc = await LandSavings.findOneAndUpdate(
        { user: req.user.id, planMonthIndex },
        { amountTransferred, notes },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      res.json({ success: true, data: doc });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// DELETE /api/land-savings/month/:planMonthIndex — clear recorded transfer
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
