const express = require('express');
const Expense = require('../models/Expense');
const { protect } = require('../middleware/auth');
const { normalizeExpenseCategory, EXPENSE_CATEGORY_VALUES } = require('../constants/expenseCategories');

const router = express.Router();

router.use(protect);

/** Treat missing/null type as expense unless category (trimmed) is exactly "savings" (case-insensitive). */
const EFFECTIVE_TYPE_ADD_FIELDS = {
  $addFields: {
    effectiveType: {
      $switch: {
        branches: [
          { case: { $eq: ['$type', 'savings'] }, then: 'savings' },
          { case: { $eq: ['$type', 'expense'] }, then: 'expense' },
        ],
        default: {
          $cond: [
            {
              $eq: [
                { $toLower: { $trim: { input: { $ifNull: ['$category', ''] } } } },
                'savings',
              ],
            },
            'savings',
            'expense',
          ],
        },
      },
    },
  },
};

/**
 * Mirrors EFFECTIVE_TYPE_ADD_FIELDS so list results match summary counts.
 * Any type other than the enum ('', stale values, etc.) uses the category rule like aggregation $switch default.
 */
function applyTypeFilter(query, type) {
  if (!type) return;
  if (type === 'expense') {
    query.$or = [
      { type: 'expense' },
      {
        $and: [
          { type: { $nin: ['expense', 'savings'] } },
          { $nor: [{ category: { $regex: /^\s*savings\s*$/i } }] },
        ],
      },
    ];
    return;
  }
  if (type === 'savings') {
    query.$or = [
      { type: 'savings' },
      {
        $and: [
          { type: { $nin: ['expense', 'savings'] } },
          { category: { $regex: /^\s*savings\s*$/i } },
        ],
      },
    ];
    return;
  }
  query.type = type;
}

/** Validate IANA zone for aggregation (fallback if invalid). */
function sanitizeTimezoneParam(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 80) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return null;
  }
}

function expenseStatsTimezone(req) {
  return sanitizeTimezoneParam(req.query.timezone) || process.env.EXPENSE_STATS_TIMEZONE || 'Asia/Kolkata';
}

function calendarYearMonthInZone(isoDate, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(isoDate);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  return { year, month };
}

function previousCalendarYearMonth(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** Last day of calendar month (month is 1–12). */
function daysInCalendarMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Oldest → newest calendar months ending at (ty, tm), length `count`. */
function buildMonthSlotsAscending(ty, tm, count) {
  let y = ty;
  let m = tm;
  for (let i = 0; i < count - 1; i++) {
    const p = previousCalendarYearMonth(y, m);
    y = p.year;
    m = p.month;
  }
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push({ year: y, month: m });
    if (i === count - 1) break;
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return slots;
}

// POST /api/expenses/bulk — import multiple expenses at once
router.post('/bulk', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'Provide an array of expenses' });
    const docs = items.map((e) => ({
      ...e,
      user: req.user.id,
      category: normalizeExpenseCategory(e.category),
    }));
    const result = await Expense.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, count: result.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/expenses — list: filters use `date`; sort order uses `createdAt` then `date` (does not affect sums — see /summary)
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
    if (category) query.category = category;
    applyTypeFilter(query, type);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      Expense.find(query).sort({ createdAt: -1, date: -1 }).skip(skip).limit(parseInt(limit)),
      Expense.countDocuments(query),
    ]);

    res.json({ success: true, data, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/summary — monthly breakdown + top categories
//
// IMPORTANT: Every total / count / bucket uses the expense document `date` field only.
// createdAt and updatedAt are never used for filtering or summing amounts.
// Calendar boundaries use IANA TZ from ?timezone=…, else EXPENSE_STATS_TIMEZONE, else Asia/Kolkata.
router.get('/summary', async (req, res) => {
  try {
    const now = new Date();
    const months = Math.min(Math.max(parseInt(req.query.months) || 3, 1), 24);
    const TZ = expenseStatsTimezone(req);

    const { year: ty, month: tm } = calendarYearMonthInZone(now, TZ);
    const { year: ly, month: lm } = previousCalendarYearMonth(ty, tm);
    const daysThisMonth = daysInCalendarMonth(ty, tm);
    const monthSlots = buildMonthSlotsAscending(ty, tm, months);

    const slotPredicates = monthSlots.map((s) => ({
      $and: [
        { $eq: ['$_cy', s.year] },
        { $eq: ['$_cm', s.month] },
      ],
    }));

    const matchThisMonthCalendar = {
      user: req.user._id,
      $expr: {
        $and: [
          { $eq: [{ $year: { date: '$date', timezone: TZ } }, ty] },
          { $eq: [{ $month: { date: '$date', timezone: TZ } }, tm] },
        ],
      },
    };

    const matchLastMonthCalendar = {
      user: req.user._id,
      $expr: {
        $and: [
          { $eq: [{ $year: { date: '$date', timezone: TZ } }, ly] },
          { $eq: [{ $month: { date: '$date', timezone: TZ } }, lm] },
        ],
      },
    };

    const [thisMonth, lastMonth, categories, monthly, dailyByDay] = await Promise.all([
      // This month type breakdown (calendar month in TZ, by transaction `date`)
      Expense.aggregate([
        { $match: matchThisMonthCalendar },
        EFFECTIVE_TYPE_ADD_FIELDS,
        { $group: { _id: '$effectiveType', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Last month type breakdown
      Expense.aggregate([
        { $match: matchLastMonthCalendar },
        EFFECTIVE_TYPE_ADD_FIELDS,
        { $group: { _id: '$effectiveType', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // Categories this month (expenses only), full list by amount desc — UI may trim for pie chart
      Expense.aggregate([
        { $match: matchThisMonthCalendar },
        EFFECTIVE_TYPE_ADD_FIELDS,
        { $match: { effectiveType: 'expense' } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Per-month totals for last N months (same TZ as cards)
      Expense.aggregate([
        { $match: { user: req.user._id } },
        {
          $addFields: {
            _cy: { $year: { date: '$date', timezone: TZ } },
            _cm: { $month: { date: '$date', timezone: TZ } },
          },
        },
        { $match: { $expr: { $or: slotPredicates } } },
        EFFECTIVE_TYPE_ADD_FIELDS,
        {
          $group: {
            _id: {
              year: '$_cy',
              month: '$_cm',
              type: '$effectiveType',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // This month: expense totals per calendar day (day-of-month in TZ)
      Expense.aggregate([
        { $match: matchThisMonthCalendar },
        EFFECTIVE_TYPE_ADD_FIELDS,
        { $match: { effectiveType: 'expense' } },
        {
          $addFields: {
            _dp: { $dateToParts: { date: '$date', timezone: TZ } },
          },
        },
        {
          $group: {
            _id: '$_dp.day',
            total: { $sum: '$amount' },
          },
        },
      ]),
    ]);

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

    const dailyMap = dailyByDay.reduce((m, r) => {
      const day = Number(r._id);
      if (!Number.isNaN(day)) m[day] = r.total;
      return m;
    }, {});
    const dailyExpenseData = [];
    for (let d = 1; d <= daysThisMonth; d += 1) {
      dailyExpenseData.push({
        day: d,
        label: String(d),
        expense: dailyMap[d] || 0,
      });
    }

    res.json({
      success: true,
      data: {
        thisMonth:    toMap(thisMonth),
        lastMonth:    toMap(lastMonth),
        topCategories: categories,
        monthlyData,
        dailyExpenseData,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/expenses/categories — allowed labels (same for all users)
router.get('/categories', async (req, res) => {
  try {
    res.json({ success: true, data: [...EXPENSE_CATEGORY_VALUES] });
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
    const body = { ...req.body, user: req.user.id };
    if (body.category != null) body.category = normalizeExpenseCategory(body.category);
    const expense = await Expense.create(body);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.category != null) body.category = normalizeExpenseCategory(body.category);
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      body,
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
