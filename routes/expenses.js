const express = require('express');
const Expense = require('../models/Expense');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// POST /api/expenses/bulk — import multiple expenses at once
router.post('/bulk', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'Provide an array of expenses' });
    const docs = items.map(e => ({ ...e, user: req.user.id }));
    const result = await Expense.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, count: result.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/expenses — list with optional filters
router.get('/', async (req, res) => {
  try {
    const { from, to, type, category, page = 1, limit = 20 } = req.query;
    const query = { user: req.user.id };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.date.$lte = toDate;
      }
    }
    if (type) query.type = type;
    if (category) query.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      Expense.find(query).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
      Expense.countDocuments(query),
    ]);

    res.json({ success: true, data, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/summary — monthly breakdown + top categories
router.get('/summary', async (req, res) => {
  try {
    const now = new Date();
    const months = Math.min(Math.max(parseInt(req.query.months) || 3, 1), 24);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const rangeStart     = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const [thisMonth, lastMonth, categories, monthly] = await Promise.all([
      // This month type breakdown
      Expense.aggregate([
        { $match: { user: req.user._id, date: { $gte: thisMonthStart } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Last month type breakdown
      Expense.aggregate([
        { $match: { user: req.user._id, date: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Top categories this month (expenses only)
      Expense.aggregate([
        { $match: { user: req.user._id, date: { $gte: thisMonthStart }, type: 'expense' } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 6 },
      ]),
      // Per-month totals for last N months
      Expense.aggregate([
        { $match: { user: req.user._id, date: { $gte: rangeStart } } },
        {
          $group: {
            _id: {
              year:  { $year: '$date' },
              month: { $month: '$date' },
              type:  '$type',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    // Build ordered month labels and data arrays
    const monthSlots = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSlots.push({ year: d.getFullYear(), month: d.getMonth() + 1 }); // month 1-indexed
    }

    const monthlyMap = {};
    monthly.forEach(r => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyMap[key]) monthlyMap[key] = {};
      monthlyMap[key][r._id.type] = { total: r.total, count: r.count };
    });

    const monthlyData = monthSlots.map(s => ({
      label: new Date(s.year, s.month - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      expense: monthlyMap[`${s.year}-${s.month}`]?.expense?.total || 0,
      savings: monthlyMap[`${s.year}-${s.month}`]?.savings?.total || 0,
      expenseCount: monthlyMap[`${s.year}-${s.month}`]?.expense?.count || 0,
      savingsCount: monthlyMap[`${s.year}-${s.month}`]?.savings?.count || 0,
    }));

    const toMap = (arr) => arr.reduce((m, x) => ({ ...m, [x._id]: { total: x.total, count: x.count } }), {});

    res.json({
      success: true,
      data: {
        thisMonth:    toMap(thisMonth),
        lastMonth:    toMap(lastMonth),
        topCategories: categories,
        monthlyData,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/categories — distinct categories used by user
router.get('/categories', async (req, res) => {
  try {
    const cats = await Expense.distinct('category', { user: req.user.id });
    res.json({ success: true, data: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/names?q=xyz — distinct names matching query
router.get('/names', async (req, res) => {
  try {
    const q = req.query.q || '';
    const filter = { user: req.user.id };
    if (q) filter.name = { $regex: q, $options: 'i' };
    const names = await Expense.distinct('name', filter);
    const sorted = names.sort((a, b) => a.localeCompare(b)).slice(0, 20);
    res.json({ success: true, data: sorted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, user: req.user.id });
    if (!expense) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, user: req.user.id });
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!expense) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
