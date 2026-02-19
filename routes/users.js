const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require admin or super_admin role
router.use(protect, authorize('admin', 'super_admin'));

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

// @desc    Create user
// @route   POST /api/users
// @access  Private/Admin
router.post('/', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['super_admin', 'admin', 'user']).withMessage('Role must be super_admin, admin or user'),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CHF', 'CNY', 'SGD', 'HKD', 'KRW', 'BRL', 'MXN', 'RUB', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK']).withMessage('Invalid currency'),
  body('monthlyIncome').optional().isFloat({ min: 0 }).withMessage('Monthly income must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role, currency, monthlyIncome } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'user',
      currency: currency || 'INR',
      monthlyIncome: monthlyIncome || 0
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        currency: user.currency,
        monthlyIncome: user.monthlyIncome,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Error creating user' });
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['super_admin', 'admin', 'user']).withMessage('Role must be super_admin, admin or user'),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CHF', 'CNY', 'SGD', 'HKD', 'KRW', 'BRL', 'MXN', 'RUB', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK']).withMessage('Invalid currency'),
  body('monthlyIncome').optional().isFloat({ min: 0 }).withMessage('Monthly income must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, email, password, role, currency, monthlyIncome } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (currency) user.currency = currency;
    if (typeof monthlyIncome === 'number' || monthlyIncome !== undefined) user.monthlyIncome = parseFloat(monthlyIncome) || 0;
    if (password) user.password = password;

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        currency: user.currency,
        monthlyIncome: user.monthlyIncome,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Error deleting user' });
  }
});

module.exports = router;
