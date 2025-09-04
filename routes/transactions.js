const express = require('express');
const { body, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const EMI = require('../models/EMI');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// @desc    Get all transactions for user
// @route   GET /api/transactions
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { type, startDate, endDate, sortBy = 'date', sortOrder = 'desc' } = req.query;

    const query = { user: req.user.id };
    
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const transactions = await Transaction.find(query)
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting transactions'
    });
  }
});

// @desc    Get single transaction
// @route   GET /api/transactions/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Make sure user owns transaction
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this transaction'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting transaction'
    });
  }
});

// @desc    Create new transaction
// @route   POST /api/transactions
// @access  Private
router.post('/', [
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('description').trim().isLength({ min: 1, max: 200 }).withMessage('Description is required and must be less than 200 characters'),

  body('date').optional().isISO8601().withMessage('Date must be a valid ISO date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { type, amount, description, date, tags, paymentMethod, recurring, notes } = req.body;

    const transaction = await Transaction.create({
      user: req.user.id,
      type,
      amount,
      description,
      date: date || new Date(),
      tags,
      paymentMethod,
      recurring,
      notes
    });

    // Check if this is an EMI payment transaction and update EMI data
    if (type === 'expense' && description && (
      description.includes('EMI Payment:') || 
      description.includes('installment') ||
      description.includes('Cheetu') ||
      description.includes('Cashe') ||
      description.includes('True Balance') ||
      description.includes('Sangam') ||
      description.includes('Suresh')
    )) {
      try {
        // Extract EMI name from description
        let emiName = null;
        if (description.includes('EMI Payment:')) {
          const match = description.match(/EMI Payment: (.+)/);
          if (match) {
            emiName = match[1].trim();
          }
        } else {
          // For other EMI types, try to extract name from description
          emiName = description.replace(/installment|EMI|Payment/gi, '').trim();
        }

        if (emiName) {
          // Find the corresponding EMI
          const emi = await EMI.findOne({
            user: req.user.id,
            name: { $regex: new RegExp(emiName, 'i') },
            status: 'active'
          });

          if (emi) {
            // Update EMI/subscription details
            if (emi.paymentType === 'subscription') {
              // For subscriptions, we don't track remaining; just roll due date forward
              // paidInstallments is optional: still increment for history/analytics
              emi.paidInstallments = (emi.paidInstallments || 0) + 1;
              emi.remainingAmount = 0;
            } else {
              emi.paidInstallments += 1;
              emi.remainingAmount = (emi.emiAmount * emi.totalInstallments) - (emi.paidInstallments * emi.emiAmount);
            }
            
            // Update next due date - ensure proper date calculation
            if (emi.nextDueDate) {
              const currentDueDate = new Date(emi.nextDueDate);
              const nextMonth = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, currentDueDate.getDate());
              emi.nextDueDate = nextMonth;
            }

            // Check if EMI is completed
            if (emi.paymentType !== 'subscription' && emi.paidInstallments >= emi.totalInstallments) {
              emi.status = 'completed';
              emi.remainingAmount = 0;
            }

            await emi.save();
            console.log(`Updated EMI ${emi.name} after payment transaction`);
          }
        }
      } catch (error) {
        console.error('Error updating EMI after transaction:', error);
        // Don't fail the transaction creation if EMI update fails
      }
    }

    res.status(201).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating transaction'
    });
  }
});

// @desc    Update transaction
// @route   PUT /api/transactions/:id
// @access  Private
router.put('/:id', [
  body('type').optional().isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('description').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Description must be less than 200 characters'),

  body('date').optional().isISO8601().withMessage('Date must be a valid ISO date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Make sure user owns transaction
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this transaction'
      });
    }



    const oldTransaction = transaction;
    
    transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    // If this was an EMI payment transaction and the description changed, update EMI data
    if (req.body.description && req.body.description !== oldTransaction.description) {
      if (req.body.type === 'expense' && req.body.description && (
        req.body.description.includes('EMI Payment:') || 
        req.body.description.includes('installment') ||
        req.body.description.includes('Cheetu') ||
        req.body.description.includes('Cashe') ||
        req.body.description.includes('True Balance') ||
        req.body.description.includes('Sangam') ||
        req.body.description.includes('Suresh')
      )) {
        try {
          // Extract EMI name from description
          let emiName = null;
          if (req.body.description.includes('EMI Payment:')) {
            const match = req.body.description.match(/EMI Payment: (.+)/);
            if (match) {
              emiName = match[1].trim();
            }
          } else {
            // For other EMI types, try to extract name from description
            emiName = req.body.description.replace(/installment|EMI|Payment/gi, '').trim();
          }

          if (emiName) {
            // Find the corresponding EMI
            const emi = await EMI.findOne({
              user: req.user.id,
              name: { $regex: new RegExp(emiName, 'i') },
              status: 'active'
            });

            if (emi) {
              // Update EMI/subscription details
              if (emi.paymentType === 'subscription') {
                emi.paidInstallments = (emi.paidInstallments || 0) + 1;
                emi.remainingAmount = 0;
              } else {
                emi.paidInstallments += 1;
                emi.remainingAmount = (emi.emiAmount * emi.totalInstallments) - (emi.paidInstallments * emi.emiAmount);
              }
              
              // Update next due date - ensure proper date calculation
              if (emi.nextDueDate) {
                const currentDueDate = new Date(emi.nextDueDate);
                const nextMonth = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, currentDueDate.getDate());
                emi.nextDueDate = nextMonth;
              }

              // Check if EMI is completed
              if (emi.paymentType !== 'subscription' && emi.paidInstallments >= emi.totalInstallments) {
                emi.status = 'completed';
                emi.remainingAmount = 0;
              }

              await emi.save();
              console.log(`Updated EMI ${emi.name} after transaction update`);
            }
          }
        } catch (error) {
          console.error('Error updating EMI after transaction update:', error);
          // Don't fail the transaction update if EMI update fails
        }
      }
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating transaction'
    });
  }
});

// @desc    Delete transaction
// @route   DELETE /api/transactions/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Make sure user owns transaction
    if (transaction.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this transaction'
      });
    }

    await transaction.deleteOne();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting transaction'
    });
  }
});

module.exports = router;
