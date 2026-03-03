const express = require('express');
const { body, validationResult } = require('express-validator');
const BudgetCategory = require('../models/BudgetCategory');
const BudgetExpense = require('../models/BudgetExpense');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

// GET /api/budget/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await BudgetCategory.find({ user: req.user.id }).sort({ name: 1 });

    // Attach total spent per category
    const BudgetExpense = require('../models/BudgetExpense');
    const totals = await BudgetExpense.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: '$category', totalSpent: { $sum: '$amount' } } }
    ]);
    const totalMap = {};
    totals.forEach(t => { totalMap[t._id.toString()] = t.totalSpent; });

    const data = categories.map(c => ({
      ...c.toObject(),
      totalSpent: totalMap[c._id.toString()] || 0
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching budget categories:', error);
    res.status(500).json({ success: false, message: 'Error fetching categories' });
  }
});

// POST /api/budget/categories
router.post('/categories', [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 300 }),
  body('color').optional().trim(),
  body('icon').optional().trim(),
  body('budgetLimit').optional().isFloat({ min: 0 }).withMessage('Budget limit must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, description, color, icon, budgetLimit, isDefault } = req.body;

    // If setting this as default, unset all others first
    if (isDefault) {
      await BudgetCategory.updateMany({ user: req.user.id }, { isDefault: false });
    }

    const category = await BudgetCategory.create({
      user: req.user.id,
      name,
      description: description || '',
      color: color || '#60A5FA',
      icon: icon || 'icon-wallet-43',
      budgetLimit: parseFloat(budgetLimit) || 0,
      isDefault: !!isDefault
    });

    res.status(201).json({ success: true, data: { ...category.toObject(), totalSpent: 0 } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    console.error('Error creating budget category:', error);
    res.status(500).json({ success: false, message: 'Error creating category' });
  }
});

// PUT /api/budget/categories/:id
router.put('/categories/:id', [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 300 }),
  body('color').optional().trim(),
  body('icon').optional().trim(),
  body('budgetLimit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const category = await BudgetCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    if (category.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    const { name, description, color, icon, budgetLimit, isDefault } = req.body;
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (budgetLimit !== undefined) category.budgetLimit = parseFloat(budgetLimit) || 0;
    if (isDefault !== undefined) {
      // If setting as default, clear all others first
      if (isDefault) {
        await BudgetCategory.updateMany({ user: req.user.id, _id: { $ne: req.params.id } }, { isDefault: false });
      }
      category.isDefault = !!isDefault;
    }

    await category.save();
    res.json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    console.error('Error updating budget category:', error);
    res.status(500).json({ success: false, message: 'Error updating category' });
  }
});

// DELETE /api/budget/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await BudgetCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    if (category.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    // Delete all expenses in this category
    await BudgetExpense.deleteMany({ category: req.params.id, user: req.user.id });
    await BudgetCategory.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Category and all its expenses deleted' });
  } catch (error) {
    console.error('Error deleting budget category:', error);
    res.status(500).json({ success: false, message: 'Error deleting category' });
  }
});

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

// GET /api/budget/expenses?categoryId=&fromDate=&toDate=&page=&limit=
router.get('/expenses', async (req, res) => {
  try {
    const { categoryId, fromDate, toDate, page, limit } = req.query;

    const filter = { user: req.user.id };
    if (categoryId) filter.category = categoryId;
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) filter.date.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setDate(end.getDate() + 1);
        filter.date.$lt = end;
      }
    }

    const total = await BudgetExpense.countDocuments(filter);
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 0;

    let query = BudgetExpense.find(filter)
      .populate('category', 'name color icon')
      .sort({ date: -1, createdAt: -1 });

    if (limitNum > 0) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const expenses = await query;

    res.json({
      success: true,
      data: expenses,
      total,
      page: pageNum,
      totalPages: limitNum > 0 ? Math.ceil(total / limitNum) : 1
    });
  } catch (error) {
    console.error('Error fetching budget expenses:', error);
    res.status(500).json({ success: false, message: 'Error fetching expenses' });
  }
});

// POST /api/budget/expenses
router.post('/expenses', [
  body('categoryId').notEmpty().withMessage('Category is required'),
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('paymentMethod').optional().isIn(['cash', 'card', 'upi', 'bank_transfer', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { categoryId, title, amount, date, notes, paymentMethod } = req.body;

    const category = await BudgetCategory.findById(categoryId);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    if (category.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    const expense = await BudgetExpense.create({
      user: req.user.id,
      category: categoryId,
      title,
      amount: parseFloat(amount),
      date: new Date(date),
      notes: notes || '',
      paymentMethod: paymentMethod || 'cash'
    });

    await expense.populate('category', 'name color icon');
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    console.error('Error creating budget expense:', error);
    res.status(500).json({ success: false, message: 'Error creating expense' });
  }
});

// PUT /api/budget/expenses/:id
router.put('/expenses/:id', [
  body('categoryId').optional().notEmpty(),
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('amount').optional().isFloat({ min: 0 }),
  body('date').optional().isISO8601(),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('paymentMethod').optional().isIn(['cash', 'card', 'upi', 'bank_transfer', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const expense = await BudgetExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    const { categoryId, title, amount, date, notes, paymentMethod } = req.body;
    if (categoryId !== undefined) expense.category = categoryId;
    if (title !== undefined) expense.title = title;
    if (amount !== undefined) expense.amount = parseFloat(amount);
    if (date !== undefined) expense.date = new Date(date);
    if (notes !== undefined) expense.notes = notes;
    if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;

    await expense.save();
    await expense.populate('category', 'name color icon');
    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error updating budget expense:', error);
    res.status(500).json({ success: false, message: 'Error updating expense' });
  }
});

// DELETE /api/budget/expenses/:id
router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await BudgetExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    await BudgetExpense.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Error deleting budget expense:', error);
    res.status(500).json({ success: false, message: 'Error deleting expense' });
  }
});

// GET /api/budget/summary — per-category totals + grand total
router.get('/summary', async (req, res) => {
  try {
    const categories = await BudgetCategory.find({ user: req.user.id });
    const totals = await BudgetExpense.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: '$category', totalSpent: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    const totalMap = {};
    totals.forEach(t => { totalMap[t._id.toString()] = { totalSpent: t.totalSpent, count: t.count }; });

    const summary = categories.map(c => ({
      _id: c._id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      budgetLimit: c.budgetLimit,
      totalSpent: totalMap[c._id.toString()]?.totalSpent || 0,
      expenseCount: totalMap[c._id.toString()]?.count || 0
    }));

    const grandTotal = summary.reduce((s, c) => s + c.totalSpent, 0);
    res.json({ success: true, data: summary, grandTotal });
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    res.status(500).json({ success: false, message: 'Error fetching summary' });
  }
});

module.exports = router;
