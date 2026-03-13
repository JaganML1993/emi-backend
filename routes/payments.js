const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const PaymentTransaction = require('../models/PaymentTransaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper function to generate monthly payment transactions
const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const generatePaymentTransactions = async (payment) => {
  const transactions = [];
  const startDate = new Date(payment.startDate);
  const endDate = new Date(payment.endDate);
  const currentDate = new Date(startDate);
  // Ensure currentDate is set to the emiDay for the month, clamped to month length
  const setToEmiDay = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    const dim = daysInMonth(d.getFullYear(), d.getMonth());
    const day = Math.min(payment.emiDay, dim);
    d.setDate(day);
    d.setHours(0,0,0,0);
    return d;
  };
  let iter = setToEmiDay(currentDate);
  
  while (iter <= endDate) {
    const paymentDate = new Date(iter);
    transactions.push({
      user: payment.user,
      payment: payment._id,
      paymentDate: paymentDate,
      amount: payment.amount,
      status: 'pending',
      month: paymentDate.getMonth() + 1,
      year: paymentDate.getFullYear()
    });
    
    // Move to next month respecting emiDay
    const nextMonth = new Date(iter);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    iter = setToEmiDay(nextMonth);
  }
  
  if (transactions.length > 0) {
    await PaymentTransaction.insertMany(transactions);
  }
  
  return transactions;
};

// @desc    Get total amount paid for savings category (all-time)
// @route   GET /api/payments/savings-total
// @access  Private
router.get('/savings-total', protect, async (req, res) => {
  try {
    // Find all savings payments for this user
    const savingsPayments = await Payment.find({ user: req.user.id, category: 'savings' });
    const savingsPaymentIds = savingsPayments.map(p => p._id);

    // Sum all paid transactions belonging to those payments
    const result = await PaymentTransaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          payment: { $in: savingsPaymentIds },
          status: 'paid',
        },
      },
      {
        $lookup: {
          from: 'payments',
          localField: 'payment',
          foreignField: '_id',
          as: 'paymentData',
        },
      },
      { $unwind: '$paymentData' },
      {
        $group: {
          _id: null,
          total: { $sum: '$paymentData.amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const total = result[0]?.total || 0;
    const count = result[0]?.count || 0;

    res.json({ success: true, data: { total, count } });
  } catch (error) {
    console.error('savings-total error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get all payments for a user
// @route   GET /api/payments
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    // Get transaction stats (total and paid) for each payment
    const paymentIds = payments.map(p => p._id);
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const txnStats = await PaymentTransaction.aggregate([
      {
        $match: {
          user: userId,
          payment: { $in: paymentIds }
        }
      },
      {
        $group: {
          _id: '$payment',
          totalCount: { $sum: 1 },
          paidCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Create a map of payment ID to paid count
    const statsMap = {};
    txnStats.forEach(item => {
      statsMap[item._id.toString()] = {
        paidCount: item.paidCount || 0,
        totalCount: item.totalCount || 0
      };
    });

    // Add paidCount to each payment
    const paymentsWithCounts = payments.map(payment => {
      const paymentObj = payment.toObject();
      const stats = statsMap[payment._id.toString()] || { paidCount: 0, totalCount: 0 };
      paymentObj.paidCount = stats.paidCount;
      paymentObj.totalCount = stats.totalCount;
      return paymentObj;
    });

    res.json({
      success: true,
      data: paymentsWithCounts
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments'
    });
  }
});


// @desc    Get upcoming payment transactions for current month
// @route   GET /api/payments/transactions/upcoming
// @access  Private
router.get('/transactions/upcoming', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    
    // Get all active payments for the user (exclude only completed ones)
    const payments = await Payment.find({
      user: req.user.id,
      status: { $ne: 'completed' }
    });

    console.log(`[Upcoming] Found ${payments.length} active payments for user ${req.user.id}`);

    // Get existing transactions for current month
    const existingTransactions = await PaymentTransaction.find({
      user: req.user.id,
      month: currentMonth,
      year: currentYear
    });

    const existingPaymentIds = new Set(
      existingTransactions.map(t => t.payment.toString())
    );

    // Helper functions
    const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
    const setToEmiDay = (date, emiDay) => {
      const d = new Date(date.getFullYear(), date.getMonth(), 1);
      const dim = daysInMonth(d.getFullYear(), d.getMonth());
      const day = Math.min(emiDay, dim);
      d.setDate(day);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Generate missing transactions for current month
    const newTransactions = [];
    for (const payment of payments) {
      // Check if payment should have a transaction this month
      const startDate = new Date(payment.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = payment.endDate ? new Date(payment.endDate) : null;
      if (endDate) {
        endDate.setHours(0, 0, 0, 0);
      }

      // Skip if payment hasn't started yet
      if (startDate > monthEnd) {
        continue;
      }

      // Skip if payment has ended (but allow it if it ended this month)
      if (endDate && endDate < monthStart) {
        continue;
      }

      // Check if transaction already exists
      if (existingPaymentIds.has(payment._id.toString())) {
        continue;
      }

      // Calculate payment date for current month
      const emiDay = payment.emiDay || startDate.getDate();
      const paymentDate = setToEmiDay(new Date(currentYear, currentMonth - 1, 1), emiDay);

      // Create transaction if payment should have a transaction this month
      // This includes payments where:
      // 1. Payment has started (startDate <= monthEnd)
      // 2. Payment hasn't ended yet (endDate is null or endDate >= monthStart)
      // 3. Payment date falls within current month (even if it's already passed)
      const paymentStarted = startDate <= monthEnd;
      const paymentNotEnded = !endDate || endDate >= monthStart;
      const paymentDateInMonth = paymentDate >= monthStart && paymentDate <= monthEnd;

      if (paymentStarted && paymentNotEnded && paymentDateInMonth) {
        // Check if transaction already exists (double-check)
        const existing = await PaymentTransaction.findOne({
          user: req.user.id,
          payment: payment._id,
          month: currentMonth,
          year: currentYear
        });

        if (!existing) {
          const newTxn = await PaymentTransaction.create({
            user: req.user.id,
            payment: payment._id,
            paymentDate: paymentDate,
            amount: payment.amount,
            status: 'pending',
            month: currentMonth,
            year: currentYear
          });
          newTransactions.push(newTxn);
          console.log(`[Upcoming] Created transaction for payment ${payment.name} on ${paymentDate.toISOString()}`);
        }
      }
    }

    console.log(`[Upcoming] Generated ${newTransactions.length} new transactions for current month`);

    // Get all transactions for current month (existing + newly created)
    const currentMonthTransactions = await PaymentTransaction.find({
      user: req.user.id,
      month: currentMonth,
      year: currentYear
    })
      .populate('payment', 'name emiType category emiDay amount startDate endDate');

    console.log(`[Upcoming] Found ${currentMonthTransactions.length} total transactions for current month (${currentMonth}/${currentYear})`);

    // Get overdue pending transactions from previous months (but exclude payments that already have current month transactions)
    const overdueDate = new Date(currentYear, currentMonth - 1, 1);
    overdueDate.setHours(0, 0, 0, 0);
    
    // Filter out transactions with null payment and get payment IDs
    const validCurrentMonthTransactions = currentMonthTransactions.filter(t => t.payment && t.payment._id);
    const currentMonthPaymentIds = new Set(
      validCurrentMonthTransactions.map(t => t.payment._id.toString())
    );

    const overdueTransactions = await PaymentTransaction.find({
      user: req.user.id,
      status: 'pending',
      paymentDate: { $lt: overdueDate }
    })
      .populate('payment', 'name emiType category emiDay amount startDate endDate')
      .sort({ paymentDate: 1 })
      .limit(50); // Limit to prevent too many overdue transactions

    // Filter out overdue transactions for payments that already have current month transactions
    const filteredOverdue = overdueTransactions.filter(t => 
      t.payment && t.payment._id && !currentMonthPaymentIds.has(t.payment._id.toString())
    );

    console.log(`[Upcoming] Found ${overdueTransactions.length} overdue transactions, ${filteredOverdue.length} after filtering`);

    // Combine current month and overdue transactions, filter out any with null payment
    const allTransactions = [...validCurrentMonthTransactions, ...filteredOverdue];

    console.log(`[Upcoming] Total transactions to return: ${allTransactions.length}`);

    // Get all unique payment IDs from transactions
    const paymentIds = [...new Set(allTransactions.map(t => t.payment?._id?.toString()).filter(Boolean))]
      .map(id => new mongoose.Types.ObjectId(id));

    // Calculate paidCount for each payment if we have payment IDs
    let statsMap = {};
    if (paymentIds.length > 0) {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const txnStats = await PaymentTransaction.aggregate([
        {
          $match: {
            user: userId,
            payment: { $in: paymentIds }
          }
        },
        {
          $group: {
            _id: '$payment',
            paidCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
              }
            }
          }
        }
      ]);

      // Create a map of payment ID to paid count
      txnStats.forEach(item => {
        statsMap[item._id.toString()] = item.paidCount || 0;
      });
    }

    // Attach paidCount to each payment object in transactions
    allTransactions.forEach(transaction => {
      if (transaction.payment && transaction.payment._id) {
        const paymentId = transaction.payment._id.toString();
        transaction.payment.paidCount = statsMap[paymentId] || 0;
      }
    });

    // Sort: pending first, then by payment date
    allTransactions.sort((a, b) => {
      const aPaid = a.status === 'paid' ? 1 : 0;
      const bPaid = b.status === 'paid' ? 1 : 0;
      if (aPaid !== bPaid) return aPaid - bPaid;
      return new Date(a.paymentDate) - new Date(b.paymentDate);
    });

    res.json({
      success: true,
      data: allTransactions
    });
  } catch (error) {
    console.error('Error fetching upcoming transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming transactions'
    });
  }
});

// @desc    Get all payment transactions
// @route   GET /api/payments/transactions
// @access  Private
router.get('/transactions', protect, async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const query = { user: req.user.id };
    
    // If no month/year specified (calendar view), generate transactions for all active payments
    if (!month && !year) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get all active payments
      const payments = await Payment.find({
        user: req.user.id,
        status: { $ne: 'completed' }
      });

      console.log(`[Calendar] Found ${payments.length} active payments for user ${req.user.id}`);

      // Helper functions
      const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
      const setToEmiDay = (date, emiDay) => {
        const d = new Date(date.getFullYear(), date.getMonth(), 1);
        const dim = daysInMonth(d.getFullYear(), d.getMonth());
        const day = Math.min(emiDay, dim);
        d.setDate(day);
        d.setHours(0, 0, 0, 0);
        return d;
      };

      let totalGenerated = 0;

      // Generate missing transactions for each payment
      for (const payment of payments) {
        try {
          const startDate = new Date(payment.startDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = payment.endDate ? new Date(payment.endDate) : null;
          if (endDate) {
            endDate.setHours(0, 0, 0, 0);
          }

          // For recurring payments, generate up to 12 months ahead
          let effectiveEndDate = endDate;
          if (payment.emiType === 'recurring') {
            effectiveEndDate = new Date(today);
            effectiveEndDate.setMonth(effectiveEndDate.getMonth() + 12);
          }

          if (!effectiveEndDate || startDate > effectiveEndDate) {
            console.log(`[Calendar] Skipping payment ${payment.name}: invalid date range`);
            continue;
          }

          const emiDay = payment.emiDay || startDate.getDate();
          
          // Generate transactions from start date to end date (or 12 months ahead for recurring)
          let currentDate = setToEmiDay(startDate, emiDay);
          const transactionsToCreate = [];

          while (currentDate <= effectiveEndDate) {
            // Check if transaction already exists
            const existing = await PaymentTransaction.findOne({
              user: req.user.id,
              payment: payment._id,
              month: currentDate.getMonth() + 1,
              year: currentDate.getFullYear()
            });

            if (!existing) {
              transactionsToCreate.push({
                user: req.user.id,
                payment: payment._id,
                paymentDate: new Date(currentDate),
                amount: payment.amount,
                status: 'pending',
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear()
              });
            }

            // Move to next month
            const nextMonth = new Date(currentDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            currentDate = setToEmiDay(nextMonth, emiDay);
          }

          // Insert new transactions in bulk
          if (transactionsToCreate.length > 0) {
            await PaymentTransaction.insertMany(transactionsToCreate);
            totalGenerated += transactionsToCreate.length;
            console.log(`[Calendar] Generated ${transactionsToCreate.length} transactions for payment ${payment.name}`);
          }
        } catch (error) {
          console.error(`[Calendar] Error generating transactions for payment ${payment.name}:`, error);
        }
      }

      console.log(`[Calendar] Total transactions generated: ${totalGenerated}`);
    }
    
    // Build query - get ALL transactions for the user (no date filter for calendar)
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (status) query.status = status;
    
    const transactions = await PaymentTransaction.find(query)
      .populate('payment', 'name emiType category emiDay amount startDate endDate')
      .sort({ paymentDate: 1 });

    console.log(`[Calendar] Query:`, JSON.stringify(query));
    console.log(`[Calendar] Returning ${transactions.length} transactions for user ${req.user.id}`);
    if (transactions.length > 0) {
      console.log(`[Calendar] Sample:`, transactions[0].payment?.name, transactions[0].paymentDate);
    }

    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions'
    });
  }
});

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
// NOTE: This route must come AFTER /transactions routes to avoid route conflicts
router.get('/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if payment belongs to user
    if (payment.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this payment'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment'
    });
  }
});

// @desc    Create new payment
// @route   POST /api/payments
// @access  Private
router.post('/', protect, [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('emiType').isIn(['ending', 'recurring']).withMessage('EMI type must be either ending or recurring'),
  body('category').isIn(['savings', 'expense']).withMessage('Category must be either savings or expense'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('startDate').isISO8601().withMessage('Please provide a valid start date'),
  body('emiDay').optional().isInt({ min: 1, max: 31 }).withMessage('EMI day must be between 1 and 31'),
  body('endDate').optional().isISO8601().withMessage('Please provide a valid end date'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      emiType,
      category,
      amount,
      startDate,
      emiDay,
      endDate,
      notes
    } = req.body;

    // Validate end date for ending type
    if (emiType === 'ending' && !endDate) {
      return res.status(400).json({
        success: false,
        message: 'End date is required for ending EMI type'
      });
    }

    // For recurring, set end date far in the future
    let finalEndDate = endDate;
    if (emiType === 'recurring') {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 10);
      finalEndDate = futureDate;
    }

    // determine emi day (use provided or infer from startDate)
    const inferredEmiDay = emiDay ? parseInt(emiDay) : new Date(startDate).getDate();

    const payment = await Payment.create({
      user: req.user.id,
      name,
      emiType,
      category,
      amount: parseFloat(amount),
      startDate: new Date(startDate),
      emiDay: inferredEmiDay,
      endDate: finalEndDate ? new Date(finalEndDate) : undefined,
      notes: notes || ''
    });

    // Generate payment transactions
    if (emiType === 'ending' && finalEndDate) {
      await generatePaymentTransactions(payment);
    } else if (emiType === 'recurring') {
      // For recurring, generate transactions for next 12 months
      const recurringEndDate = new Date(startDate);
      recurringEndDate.setMonth(recurringEndDate.getMonth() + 12);
      const tempPayment = {
        user: payment.user,
        _id: payment._id,
        startDate: payment.startDate,
        emiDay: payment.emiDay,
        endDate: recurringEndDate,
        amount: payment.amount
      };
      await generatePaymentTransactions(tempPayment);
    }

    res.status(201).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment'
    });
  }
});

// @desc    Update payment
// @route   PUT /api/payments/:id
// @access  Private
router.put('/:id', protect, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('emiType').optional().isIn(['ending', 'recurring']).withMessage('EMI type must be either ending or recurring'),
  body('category').optional().isIn(['savings', 'expense']).withMessage('Category must be either savings or expense'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('startDate').optional().isISO8601().withMessage('Please provide a valid start date'),
  body('endDate').optional().isISO8601().withMessage('Please provide a valid end date'),
  body('emiDay').optional().isInt({ min: 1, max: 31 }).withMessage('EMI day must be between 1 and 31'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if payment belongs to user
    if (payment.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this payment'
      });
    }

    const {
      name,
      emiType,
      category,
      amount,
      startDate,
      endDate,
      emiDay,
      notes,
      status
    } = req.body;

    // Update fields
    if (name) payment.name = name;
    if (emiType) payment.emiType = emiType;
    if (category) payment.category = category;
    if (amount !== undefined) payment.amount = parseFloat(amount);
    if (startDate) payment.startDate = new Date(startDate);
    if (endDate) payment.endDate = new Date(endDate);
    if (emiDay !== undefined) payment.emiDay = parseInt(emiDay, 10);
    if (notes !== undefined) payment.notes = notes;
    if (status) payment.status = status;

    // Handle recurring type end date
    if (emiType === 'recurring') {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 10);
      payment.endDate = futureDate;
    }

    // Ensure emiDay exists for legacy docs
    if (!payment.emiDay) {
      const sourceDate = payment.startDate || new Date();
      payment.emiDay = sourceDate.getDate();
    }

    await payment.save();

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment'
    });
  }
});

// @desc    Delete payment
// @route   DELETE /api/payments/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if payment belongs to user
    if (payment.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this payment'
      });
    }

    await payment.deleteOne();

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting payment'
    });
  }
});

// @desc    Get upcoming payment transactions for current month
// @route   GET /api/payments/transactions/upcoming
// @access  Private
router.get('/transactions/upcoming', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    
    // Get all active payments for the user (exclude only completed ones)
    const payments = await Payment.find({
      user: req.user.id,
      status: { $ne: 'completed' }
    });

    // Get existing transactions for current month
    const existingTransactions = await PaymentTransaction.find({
      user: req.user.id,
      month: currentMonth,
      year: currentYear
    });

    const existingPaymentIds = new Set(
      existingTransactions.map(t => t.payment.toString())
    );

    // Helper functions
    const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
    const setToEmiDay = (date, emiDay) => {
      const d = new Date(date.getFullYear(), date.getMonth(), 1);
      const dim = daysInMonth(d.getFullYear(), d.getMonth());
      const day = Math.min(emiDay, dim);
      d.setDate(day);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Generate missing transactions for current month
    const newTransactions = [];
    for (const payment of payments) {
      // Check if payment should have a transaction this month
      const startDate = new Date(payment.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = payment.endDate ? new Date(payment.endDate) : null;
      if (endDate) {
        endDate.setHours(0, 0, 0, 0);
      }

      // Skip if payment hasn't started yet
      if (startDate > monthEnd) {
        continue;
      }

      // Skip if payment has ended (but allow it if it ended this month)
      if (endDate && endDate < monthStart) {
        continue;
      }

      // Check if transaction already exists
      if (existingPaymentIds.has(payment._id.toString())) {
        continue;
      }

      // Calculate payment date for current month
      const emiDay = payment.emiDay || startDate.getDate();
      const paymentDate = setToEmiDay(new Date(currentYear, currentMonth - 1, 1), emiDay);

      // Create transaction if payment should have a transaction this month
      // This includes payments where:
      // 1. Payment has started (startDate <= monthEnd)
      // 2. Payment hasn't ended yet (endDate is null or endDate >= monthStart)
      // 3. Payment date falls within current month (even if it's already passed)
      const paymentStarted = startDate <= monthEnd;
      const paymentNotEnded = !endDate || endDate >= monthStart;
      const paymentDateInMonth = paymentDate >= monthStart && paymentDate <= monthEnd;

      if (paymentStarted && paymentNotEnded && paymentDateInMonth) {
        // Check if transaction already exists (double-check)
        const existing = await PaymentTransaction.findOne({
          user: req.user.id,
          payment: payment._id,
          month: currentMonth,
          year: currentYear
        });

        if (!existing) {
          const newTxn = await PaymentTransaction.create({
            user: req.user.id,
            payment: payment._id,
            paymentDate: paymentDate,
            amount: payment.amount,
            status: 'pending',
            month: currentMonth,
            year: currentYear
          });
          newTransactions.push(newTxn);
          console.log(`[Upcoming] Created transaction for payment ${payment.name} on ${paymentDate.toISOString()}`);
        }
      }
    }

    console.log(`[Upcoming] Generated ${newTransactions.length} new transactions for current month`);

    // Get all transactions for current month (existing + newly created)
    const currentMonthTransactions = await PaymentTransaction.find({
      user: req.user.id,
      month: currentMonth,
      year: currentYear
    })
      .populate('payment', 'name emiType category emiDay amount startDate endDate');

    console.log(`[Upcoming] Found ${currentMonthTransactions.length} total transactions for current month (${currentMonth}/${currentYear})`);

    // Get overdue pending transactions from previous months (but exclude payments that already have current month transactions)
    const overdueDate = new Date(currentYear, currentMonth - 1, 1);
    overdueDate.setHours(0, 0, 0, 0);
    
    // Filter out transactions with null payment and get payment IDs
    const validCurrentMonthTransactions = currentMonthTransactions.filter(t => t.payment && t.payment._id);
    const currentMonthPaymentIds = new Set(
      validCurrentMonthTransactions.map(t => t.payment._id.toString())
    );

    const overdueTransactions = await PaymentTransaction.find({
      user: req.user.id,
      status: 'pending',
      paymentDate: { $lt: overdueDate }
    })
      .populate('payment', 'name emiType category emiDay amount startDate endDate')
      .sort({ paymentDate: 1 })
      .limit(50); // Limit to prevent too many overdue transactions

    // Filter out overdue transactions for payments that already have current month transactions
    const filteredOverdue = overdueTransactions.filter(t => 
      t.payment && t.payment._id && !currentMonthPaymentIds.has(t.payment._id.toString())
    );

    console.log(`[Upcoming] Found ${overdueTransactions.length} overdue transactions, ${filteredOverdue.length} after filtering`);

    // Combine current month and overdue transactions, filter out any with null payment
    const allTransactions = [...validCurrentMonthTransactions, ...filteredOverdue];

    console.log(`[Upcoming] Total transactions to return: ${allTransactions.length}`);

    // Get all unique payment IDs from transactions
    const paymentIds = [...new Set(allTransactions.map(t => t.payment?._id?.toString()).filter(Boolean))]
      .map(id => new mongoose.Types.ObjectId(id));

    // Calculate paidCount for each payment if we have payment IDs
    let statsMap = {};
    if (paymentIds.length > 0) {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const txnStats = await PaymentTransaction.aggregate([
        {
          $match: {
            user: userId,
            payment: { $in: paymentIds }
          }
        },
        {
          $group: {
            _id: '$payment',
            paidCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
              }
            }
          }
        }
      ]);

      // Create a map of payment ID to paid count
      txnStats.forEach(item => {
        statsMap[item._id.toString()] = item.paidCount || 0;
      });
    }

    // Attach paidCount to each payment object in transactions
    allTransactions.forEach(transaction => {
      if (transaction.payment && transaction.payment._id) {
        const paymentId = transaction.payment._id.toString();
        transaction.payment.paidCount = statsMap[paymentId] || 0;
      }
    });

    // Sort: pending first, then by payment date
    allTransactions.sort((a, b) => {
      const aPaid = a.status === 'paid' ? 1 : 0;
      const bPaid = b.status === 'paid' ? 1 : 0;
      if (aPaid !== bPaid) return aPaid - bPaid;
      return new Date(a.paymentDate) - new Date(b.paymentDate);
    });

    res.json({
      success: true,
      data: allTransactions
    });
  } catch (error) {
    console.error('Error fetching upcoming transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming transactions'
    });
  }
});


// @desc    Mark payment transaction as paid
// @route   PUT /api/payments/transactions/:id/paid
// @access  Private
router.put('/transactions/:id/paid', protect, [
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const transaction = await PaymentTransaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction belongs to user
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this transaction'
      });
    }

    transaction.status = 'paid';
    transaction.paidDate = new Date();
    if (req.body.notes) {
      transaction.notes = req.body.notes;
    }

    await transaction.save();

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating transaction'
    });
  }
});

// @desc    Mark payment transaction as pending
// @route   PUT /api/payments/transactions/:id/pending
// @access  Private
router.put('/transactions/:id/pending', protect, async (req, res) => {
  try {
    const transaction = await PaymentTransaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction belongs to user
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this transaction'
      });
    }

    transaction.status = 'pending';
    transaction.paidDate = null;

    await transaction.save();

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating transaction'
    });
  }
});

// @desc    Update payment transaction amount
// @route   PUT /api/payments/transactions/:id
// @access  Private
router.put('/transactions/:id', protect, [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('status').optional().isIn(['pending', 'paid']).withMessage('Status must be pending or paid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const transaction = await PaymentTransaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction belongs to user
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this transaction'
      });
    }

    // Update amount if provided
    if (req.body.amount !== undefined) {
      transaction.amount = parseFloat(req.body.amount);
    }

    // Update status if provided
    if (req.body.status !== undefined) {
      transaction.status = req.body.status;
      if (req.body.status === 'paid' && !transaction.paidDate) {
        transaction.paidDate = new Date();
      } else if (req.body.status === 'pending') {
        transaction.paidDate = null;
      }
    }

    await transaction.save();

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating transaction'
    });
  }
});

module.exports = router;

