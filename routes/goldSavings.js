const express = require('express');
const https = require('https');
const GoldSavings = require('../models/GoldSavings');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Simple in-memory cache (10 minutes)
let goldPriceCache = null;
let goldPriceCacheTime = 0;
// Cache version — bump when price formula changes to invalidate old cache
const CACHE_VERSION = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'EMI-App/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    }).on('error', reject);
  });
}

// @desc    Get live gold price in INR per gram
// @route   GET /api/gold-savings/gold-price
// @access  Private
router.get('/gold-price', protect, async (req, res) => {
  try {
    const now = Date.now();
    if (goldPriceCache && (now - goldPriceCacheTime) < CACHE_TTL_MS) {
      return res.json({ success: true, data: goldPriceCache, cached: true });
    }

    const [goldData, forexData] = await Promise.all([
      fetchJson('https://api.gold-api.com/price/XAU'),
      fetchJson('https://api.exchangerate-api.com/v4/latest/USD')
    ]);

    const goldPriceUsdPerOunce = goldData.price;
    const prevCloseUsdPerOunce = goldData.prev_close_price || goldData.prevClosePrice || goldData.previous_close || null;
    const usdToInr = forexData.rates.INR;
    const ounceToGram = 31.1035;

    // Apply Indian import duty (6%) only — matches IBJA/market rate
    // GST (3%) is added separately at point of purchase by the jeweller
    const INDIA_TAX_FACTOR = 1.06;
    const pricePerGram24k = ((goldPriceUsdPerOunce * usdToInr) / ounceToGram) * INDIA_TAX_FACTOR;
    const pricePerGram22k = pricePerGram24k * (22 / 24);

    const prevPerGram24k = prevCloseUsdPerOunce
      ? Math.round(((prevCloseUsdPerOunce * usdToInr) / ounceToGram) * INDIA_TAX_FACTOR)
      : null;
    const prevPerGram22k = prevPerGram24k ? Math.round(prevPerGram24k * (22 / 24)) : null;

    const change24k = prevPerGram24k ? Math.round(pricePerGram24k) - prevPerGram24k : null;

    goldPriceCache = {
      pricePerGram24k: Math.round(pricePerGram24k),
      pricePerGram22k: Math.round(pricePerGram22k),
      prevPerGram24k,
      prevPerGram22k,
      change24k,
      usdToInr: Math.round(usdToInr * 100) / 100,
      goldUsdPerOunce: goldPriceUsdPerOunce,
      fetchedAt: new Date().toISOString()
    };
    goldPriceCacheTime = now;

    res.json({ success: true, data: goldPriceCache, cached: false });
  } catch (error) {
    console.error('Gold price fetch error:', error.message);
    res.status(502).json({ success: false, message: 'Could not fetch live gold price. Try again later.' });
  }
});

// All routes below are protected
router.use(protect);

// @desc    Get summary (total grams, total value, breakdown by goldType)
// @route   GET /api/gold-savings/summary
router.get('/summary', async (req, res) => {
  try {
    const breakdown = await GoldSavings.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$goldType',
          totalGrams: { $sum: '$grams' },
          totalValue: { $sum: { $multiply: ['$grams', '$pricePerGram'] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalGrams: -1 } }
    ]);

    const totals = await GoldSavings.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalGrams: { $sum: '$grams' },
          totalValue: { $sum: { $multiply: ['$grams', '$pricePerGram'] } },
          count: { $sum: 1 }
        }
      }
    ]);

    const total = totals[0] || { totalGrams: 0, totalValue: 0, count: 0 };
    const avgPricePerGram = total.totalGrams > 0 ? total.totalValue / total.totalGrams : 0;

    res.json({
      success: true,
      data: {
        totalGrams: total.totalGrams,
        totalValue: total.totalValue,
        avgPricePerGram,
        count: total.count,
        breakdown
      }
    });
  } catch (error) {
    console.error('Gold savings summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching summary' });
  }
});

// @desc    Get all gold savings entries
// @route   GET /api/gold-savings
router.get('/', async (req, res) => {
  try {
    const { goldType, from, to, page = 1, limit = 50 } = req.query;
    const filter = { user: req.user._id };

    if (goldType && goldType !== 'all') filter.goldType = goldType;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.date.$lte = toDate;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      GoldSavings.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
      GoldSavings.countDocuments(filter)
    ]);

    res.json({ success: true, data: entries, total, page: parseInt(page) });
  } catch (error) {
    console.error('Get gold savings error:', error);
    res.status(500).json({ success: false, message: 'Error fetching entries' });
  }
});

// @desc    Create gold savings entry
// @route   POST /api/gold-savings
router.post('/', async (req, res) => {
  try {
    const { date, grams, pricePerGram, paymentType, goldType, notes } = req.body;

    if (!date || !grams || !pricePerGram) {
      return res.status(400).json({ success: false, message: 'Date, grams, and price per gram are required' });
    }

    const entry = await GoldSavings.create({
      user: req.user._id,
      date,
      grams: parseFloat(grams),
      pricePerGram: parseFloat(pricePerGram),
      paymentType: paymentType || 'cash',
      goldType: goldType || 'physical',
      notes: notes || ''
    });

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    console.error('Create gold savings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error creating entry' });
  }
});

// @desc    Update gold savings entry
// @route   PUT /api/gold-savings/:id
router.put('/:id', async (req, res) => {
  try {
    const entry = await GoldSavings.findOne({ _id: req.params.id, user: req.user._id });
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });

    const { date, grams, pricePerGram, paymentType, goldType, notes } = req.body;
    if (date !== undefined) entry.date = date;
    if (grams !== undefined) entry.grams = parseFloat(grams);
    if (pricePerGram !== undefined) entry.pricePerGram = parseFloat(pricePerGram);
    if (paymentType !== undefined) entry.paymentType = paymentType;
    if (goldType !== undefined) entry.goldType = goldType;
    if (notes !== undefined) entry.notes = notes;

    await entry.save();
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Update gold savings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error updating entry' });
  }
});

// @desc    Delete gold savings entry
// @route   DELETE /api/gold-savings/:id
router.delete('/:id', async (req, res) => {
  try {
    const entry = await GoldSavings.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, message: 'Entry deleted' });
  } catch (error) {
    console.error('Delete gold savings error:', error);
    res.status(500).json({ success: false, message: 'Error deleting entry' });
  }
});

module.exports = router;
