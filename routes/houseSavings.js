const express = require('express');
const { body, validationResult } = require('express-validator');
const HouseSavings = require('../models/HouseSavings');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @desc    Get/Set house savings goal
// @route   GET /api/house-savings/goal - get goal
// @route   PUT /api/house-savings/goal - set goal (super_admin can pass userId)
// @access  Private
router.get('/goal', async (req, res) => {
  try {
    let targetUserId = req.user.id;
    if (req.user.role === 'super_admin' && req.query.userId) targetUserId = req.query.userId;
    const user = await User.findById(targetUserId).select('houseSavingsGoal');
    res.json({ success: true, goal: user?.houseSavingsGoal || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching goal' });
  }
});

router.put('/goal', [
  body('goal').isFloat({ min: 0 }).withMessage('Goal must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    let targetUserId = req.user.id;
    if (req.user.role === 'super_admin' && req.body.userId) targetUserId = req.body.userId;
    await User.findByIdAndUpdate(targetUserId, { houseSavingsGoal: parseFloat(req.body.goal) || 0 });
    res.json({ success: true, goal: parseFloat(req.body.goal) || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating goal' });
  }
});

// @desc    Get all house savings for user
// @route   GET /api/house-savings
// @access  Private (super_admin can pass ?userId= to view other users)
// Query: fromDate, toDate (ISO), search (notes), sortBy (date|amount), sortOrder (asc|desc), page, limit
router.get('/', async (req, res) => {
  try {
    let targetUserId = req.user.id;
    if (req.user.role === 'super_admin' && req.query.userId) {
      targetUserId = req.query.userId;
    }
    const { fromDate, toDate, search, sortBy = 'date', sortOrder = 'desc', page, limit } = req.query;

    const filter = { user: targetUserId };
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) filter.date.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setDate(end.getDate() + 1);
        filter.date.$lt = end; // exclude next day to include full toDate
      }
    }
    if (search && search.trim()) filter.notes = { $regex: search.trim(), $options: 'i' };

    const sort = {};
    sort[sortBy === 'amount' ? 'amount' : 'date'] = sortOrder === 'asc' ? 1 : -1;

    let query = HouseSavings.find(filter).sort(sort);
    const total = await HouseSavings.countDocuments(filter);

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 0;
    if (limitNum > 0) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }
    const savings = await query;

    res.json({
      success: true,
      data: savings,
      total,
      page: limitNum > 0 ? pageNum : 1,
      limit: limitNum || total,
      totalPages: limitNum > 0 ? Math.ceil(total / limitNum) : 1
    });
  } catch (error) {
    console.error('Error fetching house savings:', error);
    res.status(500).json({ success: false, message: 'Error fetching savings' });
  }
});

// @desc    Get single house savings entry
// @route   GET /api/house-savings/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const entry = await HouseSavings.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Savings entry not found' });
    }
    if (entry.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching house savings:', error);
    res.status(500).json({ success: false, message: 'Error fetching savings' });
  }
});

// @desc    Create house savings entry
// @route   POST /api/house-savings
// @access  Private
router.post('/', [
  body('date').isISO8601().withMessage('Please provide a valid date'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { date, amount, notes, userId } = req.body;
    const targetUser = (req.user.role === 'super_admin' && userId) ? userId : req.user.id;
    const entry = await HouseSavings.create({
      user: targetUser,
      date: new Date(date),
      amount: parseFloat(amount),
      notes: notes || ''
    });
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    console.error('Error creating house savings:', error);
    res.status(500).json({ success: false, message: 'Error creating savings' });
  }
});

// @desc    Update house savings entry
// @route   PUT /api/house-savings/:id
// @access  Private/Super Admin only
router.put('/:id', authorize('super_admin'), [
  body('date').optional().isISO8601().withMessage('Please provide a valid date'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    let entry = await HouseSavings.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Savings entry not found' });
    }
    if (entry.user.toString() !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const { date, amount, notes } = req.body;
    if (date) entry.date = new Date(date);
    if (amount !== undefined) entry.amount = parseFloat(amount);
    if (notes !== undefined) entry.notes = notes;
    await entry.save();
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error updating house savings:', error);
    res.status(500).json({ success: false, message: 'Error updating savings' });
  }
});

// @desc    Delete house savings entry
// @route   DELETE /api/house-savings/:id
// @access  Private/Super Admin only
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const entry = await HouseSavings.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Savings entry not found' });
    }
    if (entry.user.toString() !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await HouseSavings.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Savings entry deleted' });
  } catch (error) {
    console.error('Error deleting house savings:', error);
    res.status(500).json({ success: false, message: 'Error deleting savings' });
  }
});

module.exports = router;
