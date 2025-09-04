const express = require('express');
const { body, validationResult } = require('express-validator');
const EMI = require('../models/EMI');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all EMIs for a user
// @route   GET /api/emis
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const emis = await EMI.find({ user: req.user.id })
      .sort({ nextDueDate: 1 });

    res.json({
      success: true,
      data: emis
    });
  } catch (error) {
    console.error('Error fetching EMIs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching EMIs'
    });
  }
});

// @desc    Get single EMI
// @route   GET /api/emis/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this EMI'
      });
    }

    res.json({
      success: true,
      data: emi
    });
  } catch (error) {
    console.error('Error fetching EMI:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching EMI'
    });
  }
});

// @desc    Create new EMI
// @route   POST /api/emis
// @access  Private
router.post('/', protect, [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('type').isIn([
    'personal_loan', 'mobile_emi', 'laptop_emi', 'savings_emi',
    'car_loan', 'home_loan', 'business_loan', 'education_loan',
    'credit_card', 'appliance_emi', 'furniture_emi', 'bike_emi', 'cheetu', 'rent', 'other'
  ]).withMessage('Invalid EMI type'),
  body('paymentType').isIn(['emi', 'full_payment', 'subscription']).withMessage('Payment type must be either EMI, Subscription or Full Payment'),

  body('emiAmount').optional().isFloat({ min: 0 }).withMessage('EMI amount must be a positive number'),
  // Allow 0 for subscriptions; enforce >=1 for EMI inside handler
  body('totalInstallments').optional().isInt({ min: 0 }).withMessage('Total installments must be a non-negative integer'),
  body('startDate').isISO8601().withMessage('Please provide a valid start date'),
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
      type,
      paymentType,
      emiAmount,
      totalInstallments,
      startDate,
      notes
    } = req.body;

    // Validate EMI-specific fields for EMI payment type
    if (paymentType === 'emi') {
      if (!emiAmount) {
        return res.status(400).json({
          success: false,
          message: 'EMI amount is required for EMI payment type'
        });
      }
      if (!totalInstallments) {
        return res.status(400).json({
          success: false,
          message: 'Total installments is required for EMI payment type'
        });
      }
    } else if (paymentType === 'subscription') {
      if (!emiAmount) {
        return res.status(400).json({
          success: false,
          message: 'Amount is required for subscription payment type'
        });
      }
    }

    // Calculate dates and amounts based on payment type
    let endDate, nextDueDate, remainingAmount;
    
    if (paymentType === 'emi') {
      const start = new Date(startDate);
      endDate = new Date(start);
      endDate.setMonth(start.getMonth() + totalInstallments);
      
      nextDueDate = new Date(start);
      nextDueDate.setMonth(start.getMonth() + 1);
      
      remainingAmount = parseFloat(emiAmount) * parseInt(totalInstallments);
    } else if (paymentType === 'subscription') {
      const start = new Date(startDate);
      endDate = null;
      nextDueDate = new Date(start);
      nextDueDate.setMonth(start.getMonth() + 1);
      remainingAmount = 0;
    } else {
      // Full payment
      endDate = new Date(startDate);
      nextDueDate = new Date(startDate);
      remainingAmount = 0;
    }

    const emi = await EMI.create({
      user: req.user.id,
      name,
      type,
      paymentType,
      emiAmount: parseFloat(emiAmount),
      totalInstallments: paymentType === 'emi' ? parseInt(totalInstallments) : (paymentType === 'subscription' ? undefined : 1),
      startDate: new Date(startDate),
      nextDueDate,
      endDate,
      notes,
      remainingAmount,
      paidInstallments: paymentType === 'full_payment' ? 1 : 0
    });

    res.status(201).json({
      success: true,
      data: emi
    });
  } catch (error) {
    console.error('Error creating EMI:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating EMI'
    });
  }
});

// @desc    Update EMI
// @route   PUT /api/emis/:id
// @access  Private
router.put('/:id', protect, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('type').optional().isIn([
    'personal_loan', 'mobile_emi', 'laptop_emi', 'savings_emi',
    'car_loan', 'home_loan', 'business_loan', 'education_loan',
    'credit_card', 'appliance_emi', 'furniture_emi', 'bike_emi', 'cheetu', 'rent', 'other'
  ]).withMessage('Invalid EMI type'),
  body('paymentType').optional().isIn(['emi', 'full_payment', 'subscription']).withMessage('Payment type must be either EMI, Subscription or Full Payment'),

  body('emiAmount').optional().isFloat({ min: 0 }).withMessage('EMI amount must be a positive number'),
  // Allow 0 for subscriptions; enforce >=1 for EMI in logic
  body('totalInstallments').optional().isInt({ min: 0 }).withMessage('Total installments must be a non-negative integer'),
  body('startDate').optional().isISO8601().withMessage('Please provide a valid start date'),
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

    let emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this EMI'
      });
    }

    const updateData = { ...req.body };

    // Handle payment type changes
    if (updateData.paymentType && updateData.paymentType !== emi.paymentType) {
      if (updateData.paymentType === 'full_payment') {
        updateData.totalInstallments = 1;
        updateData.paidInstallments = 1;
        updateData.remainingAmount = 0;
        updateData.endDate = updateData.startDate || emi.startDate;
        updateData.nextDueDate = updateData.startDate || emi.startDate;
      } else {
        // Switching back to EMI
        if (!updateData.emiAmount && !emi.emiAmount) {
          return res.status(400).json({
            success: false,
            message: 'EMI amount is required when switching to EMI payment type'
          });
        }
        if (!updateData.totalInstallments && !emi.totalInstallments) {
          return res.status(400).json({
            success: false,
            message: 'Total installments is required when switching to EMI payment type'
          });
        }
      }
    }

    // Recalculate dates if start date or total installments changed
    if (updateData.startDate || updateData.totalInstallments) {
      const start = updateData.startDate ? new Date(updateData.startDate) : emi.startDate;
      const totalInst = updateData.totalInstallments || emi.totalInstallments;
      
      if (emi.paymentType === 'emi') {
        updateData.endDate = new Date(start);
        updateData.endDate.setMonth(start.getMonth() + totalInst);
      } else if (emi.paymentType === 'subscription') {
        updateData.endDate = null;
      }
      
      updateData.nextDueDate = new Date(start);
      updateData.nextDueDate.setMonth(start.getMonth() + (emi.paidInstallments || 0) + 1);
    }

    // Recalculate remaining amount if relevant fields changed
    if (updateData.emiAmount || updateData.paidInstallments || updateData.totalInstallments) {
      const emiAmount = updateData.emiAmount || emi.emiAmount;
      const totalInstallments = updateData.totalInstallments || emi.totalInstallments;
      const paidInstallments = updateData.paidInstallments || emi.paidInstallments;
      
      if (emi.paymentType === 'subscription') {
        updateData.remainingAmount = 0;
      } else {
        updateData.remainingAmount = (emiAmount * totalInstallments) - (paidInstallments * emiAmount);
      }
    }

    emi = await EMI.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    res.json({
      success: true,
      data: emi
    });
  } catch (error) {
    console.error('Error updating EMI:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating EMI'
    });
  }
});

// @desc    Create multiple transaction records for past EMI payments
// @route   POST /api/emis/:id/bulk-transactions
// @access  Private
router.post('/:id/bulk-transactions', protect, [
  body('startDate').isISO8601().withMessage('Please provide a valid start date'),
  body('numberOfPayments').isInt({ min: 1, max: 60 }).withMessage('Number of payments must be between 1 and 60'),
  body('paymentAmount').isFloat({ min: 0 }).withMessage('Payment amount must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { startDate, numberOfPayments, paymentAmount } = req.body;

    const emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this EMI'
      });
    }

    // Check if EMI is active
    if (emi.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add transactions for inactive EMI'
      });
    }

    const transactions = [];
    const start = new Date(startDate);

    // Create transaction records for each payment
    for (let i = 0; i < numberOfPayments; i++) {
      const paymentDate = new Date(start);
      paymentDate.setMonth(start.getMonth() + i);

      const transaction = await Transaction.create({
        user: req.user.id,
        type: 'expense',
        amount: parseFloat(paymentAmount),
        description: `EMI Payment: ${emi.name} (Installment ${i + 1})`,
        date: paymentDate,
        paymentMethod: 'bank_transfer',
        notes: `Historical EMI payment for ${emi.name} - Installment ${i + 1} of ${numberOfPayments}`,
        recurring: {
          isRecurring: true,
          frequency: 'monthly',
          nextDueDate: new Date(paymentDate.getTime() + (30 * 24 * 60 * 60 * 1000)) // Next month
        }
      });

      transactions.push(transaction);
    }

    res.json({
      success: true,
      message: `Successfully created ${numberOfPayments} transaction records for ${emi.name}`,
      data: {
        emi: emi,
        transactions: transactions,
        totalAmount: numberOfPayments * paymentAmount
      }
    });
  } catch (error) {
    console.error('Error creating bulk transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bulk transactions'
    });
  }
});

// @desc    Update EMI with multiple paid installments
// @route   PUT /api/emis/:id/bulk-update
// @access  Private
router.put('/:id/bulk-update', protect, [
  body('paidInstallments').isInt({ min: 0 }).withMessage('Paid installments must be a non-negative integer'),
  body('lastPaymentDate').isISO8601().withMessage('Please provide a valid last payment date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { paidInstallments, lastPaymentDate } = req.body;

    const emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this EMI'
      });
    }

    // Check if EMI is active
    if (emi.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update inactive EMI'
      });
    }

    // Validate paid installments
    if (paidInstallments > emi.totalInstallments) {
      return res.status(400).json({
        success: false,
        message: 'Paid installments cannot exceed total installments'
      });
    }

    // Update EMI details
    emi.paidInstallments = paidInstallments;
    emi.remainingAmount = (emi.emiAmount * emi.totalInstallments) - (paidInstallments * emi.emiAmount);
    
    // Calculate next due date based on last payment date
    const lastPayment = new Date(lastPaymentDate);
    emi.nextDueDate = new Date(lastPayment);
    emi.nextDueDate.setMonth(lastPayment.getMonth() + 1);

    // Check if EMI is completed
    if (emi.paidInstallments >= emi.totalInstallments) {
      emi.status = 'completed';
      emi.remainingAmount = 0;
      emi.nextDueDate = emi.endDate;
    }

    await emi.save();

    res.json({
      success: true,
      message: 'EMI updated successfully with bulk payment information',
      data: emi
    });
  } catch (error) {
    console.error('Error updating EMI with bulk payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating EMI with bulk payments'
    });
  }
});

// @desc    Record EMI payment
// @route   POST /api/emis/:id/pay
// @access  Private
router.post('/:id/pay', protect, [
  body('amount').isFloat({ min: 0 }).withMessage('Payment amount must be a positive number'),
  body('date').isISO8601().withMessage('Please provide a valid payment date'),
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

    const { amount, date, notes } = req.body;

    const emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this EMI'
      });
    }

    // Check if EMI is active
    if (emi.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot make payment for inactive EMI'
      });
    }

    // Update EMI/subscription details
    if (emi.paymentType === 'subscription') {
      emi.paidInstallments = (emi.paidInstallments || 0) + 1;
      emi.remainingAmount = 0;
    } else {
      emi.paidInstallments += 1;
      emi.remainingAmount = (emi.emiAmount * emi.totalInstallments) - (emi.paidInstallments * emi.emiAmount);
    }
    
    // Update next due date - ensure proper date calculation
    const currentDueDate = new Date(emi.nextDueDate);
    const nextMonth = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, currentDueDate.getDate());
    emi.nextDueDate = nextMonth;

    // Check if EMI is completed
    if (emi.paymentType !== 'subscription' && emi.paidInstallments >= emi.totalInstallments) {
      emi.status = 'completed';
      emi.remainingAmount = 0;
    }

    await emi.save();

    // Create transaction record without category (since we removed categories from EMIs)
    const transaction = await Transaction.create({
      user: req.user.id,
      type: 'expense',
      amount: parseFloat(amount),
      description: `EMI Payment: ${emi.name}`,
      date: new Date(date),
      paymentMethod: 'bank_transfer',
      notes: notes || `EMI payment for ${emi.name}`,
      recurring: {
        isRecurring: true,
        frequency: 'monthly',
        nextDueDate: emi.nextDueDate
      }
    });

    res.json({
      success: true,
      message: 'EMI payment recorded successfully',
      data: {
        emi: emi,
        transaction: transaction
      }
    });
  } catch (error) {
    console.error('Error recording EMI payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording EMI payment'
    });
  }
});

// @desc    Delete EMI
// @route   DELETE /api/emis/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const emi = await EMI.findById(req.params.id);

    if (!emi) {
      return res.status(404).json({
        success: false,
        message: 'EMI not found'
      });
    }

    // Check if EMI belongs to user
    if (emi.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this EMI'
      });
    }

    await emi.remove();

    res.json({
      success: true,
      message: 'EMI deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting EMI:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting EMI'
    });
  }
});

// @desc    Get EMI summary
// @route   GET /api/emis/summary
// @access  Private
router.get('/summary', protect, async (req, res) => {
  try {
    const emis = await EMI.find({ user: req.user.id });

    const summary = {
      total: emis.length,
      active: emis.filter(emi => emi.status === 'active').length,
      completed: emis.filter(emi => emi.status === 'completed').length,
      defaulted: emis.filter(emi => emi.status === 'defaulted').length,
      totalAmount: emis.reduce((sum, emi) => sum + (emi.emiAmount * (emi.totalInstallments || 0)), 0),
      totalRemaining: emis.reduce((sum, emi) => sum + (emi.remainingAmount || 0), 0),
      totalPaid: emis.reduce((sum, emi) => sum + ((emi.paidInstallments || 0) * emi.emiAmount), 0),
      monthlyEMI: emis.filter(emi => emi.status === 'active')
        .reduce((sum, emi) => sum + emi.emiAmount, 0)
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching EMI summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching EMI summary'
    });
  }
});

module.exports = router;
