const express = require('express');
const Transaction = require('../models/Transaction');
const EMI = require('../models/EMI');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// @desc    Get dashboard summary
// @route   GET /api/reports/dashboard
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    const currentDate = new Date();
    const { startDate, endDate } = req.query;
    
    // Determine date range based on query parameters or default to current month
    let dateStart, dateEnd;
    
    if (startDate && endDate) {
      // Use provided date range
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
      // Set time to end of day for endDate
      dateEnd.setHours(23, 59, 59, 999);
    } else {
      // Default to current month
      dateStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      dateEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    }
    
    const currentMonthTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: dateStart, $lte: dateEnd }
    });
    
    // Get current year transactions for monthly trend
    const yearStart = new Date(currentDate.getFullYear(), 0, 1);
    const yearEnd = new Date(currentDate.getFullYear(), 11, 31);
    
    const yearTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: yearStart, $lte: yearEnd }
    });

    // Get all-time transactions for total savings calculation
    const allTimeTransactions = await Transaction.find({
      user: req.user.id
    });

    // Calculate totals for current month
    const totalIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Calculate total expenses as sum of all EMIs except savings EMIs, savings ami, and full payment EMIs
    const allEMIs = await EMI.find({
      user: req.user.id,
      status: 'active'
    });
    
    const totalExpenses = allEMIs
      .filter(emi => emi.type !== 'savings_emi' && emi.paymentType !== 'full_payment')
      .reduce((sum, emi) => sum + (emi.emiAmount || 0), 0);

    const netAmount = totalIncome - totalExpenses;

    // Calculate monthly savings (sum of all savings_emi type EMIs)
    const monthlySavings = allEMIs
      .filter(emi => emi.type === 'savings_emi' && emi.status === 'active')
      .reduce((sum, emi) => sum + (emi.emiAmount || 0), 0);

    // Calculate total savings (sum of all-time income only)
    const totalSavings = allTimeTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    // Get EMI type breakdown for current month
    const emiTypeBreakdown = {};
    currentMonthTransactions.forEach(transaction => {
      // Extract EMI type from description or tags
      let emiType = 'Other';
      let color = '#6c757d'; // Default gray color
      
      if (transaction.description && transaction.description.includes('EMI Payment:')) {
        // Extract EMI type from description
        const emiMatch = transaction.description.match(/EMI Payment: (.+)/);
        if (emiMatch) {
          emiType = emiMatch[1];
          
          // Assign colors based on EMI type
          if (emiType.includes('One Card')) {
            color = '#fd5d93'; // Pink for credit card
          } else if (emiType.includes('S24 ultra mobile')) {
            color = '#00d25b'; // Green for mobile
          } else if (emiType.includes('Ather')) {
            color = '#1d8cf8'; // Blue for bike
          } else if (emiType.includes('Cheetu')) {
            color = '#9c27b0'; // Purple for cheetu
          } else if (emiType.includes('EMI')) {
            color = '#ff8d72'; // Orange for general EMI
          }
        }
      } else if (transaction.tags && transaction.tags.includes('emi')) {
        // Check tags for EMI type
        if (transaction.tags.includes('one-card')) {
          emiType = 'One Card EMI';
          color = '#fd5d93';
        } else if (transaction.tags.includes('s24-ultra')) {
          emiType = 'S24 Ultra Mobile EMI';
          color = '#00d25b';
        } else if (transaction.tags.includes('ather')) {
          emiType = 'Ather Bike EMI';
          color = '#1d8cf8';
        } else if (transaction.tags.includes('cheetu')) {
          emiType = 'Cheetu EMI';
          color = '#9c27b0';
        } else {
          emiType = 'Other EMI';
          color = '#ff8d72';
        }
      } else if (transaction.type === 'income') {
        emiType = 'Income';
        color = '#00d25b';
      } else {
        emiType = 'Other Expenses';
        color = '#6c757d';
      }

      if (!emiTypeBreakdown[emiType]) {
        emiTypeBreakdown[emiType] = {
          income: 0,
          expense: 0,
          color: color
        };
      }
      if (transaction.type === 'income') {
        emiTypeBreakdown[emiType].income += transaction.amount;
      } else {
        emiTypeBreakdown[emiType].expense += transaction.amount;
      }
    });

    // Get recent transactions for the selected date range (last 5)
    const recentTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: dateStart, $lte: dateEnd }
    })
    .sort({ date: -1 })
    .limit(5);

    // Get monthly trend for current year (all 12 months)
    const monthlyTrend = [];
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(currentDate.getFullYear(), i, 1);
      const monthEnd = new Date(currentDate.getFullYear(), i + 1, 0);
      
      // Get transactions for this specific month
      const monthTransactions = yearTransactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= monthStart && txDate <= monthEnd;
      });
      
      // Calculate monthly income from transactions
      const monthIncome = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Calculate monthly expenses from transactions
      // This shows actual monthly spending patterns
      const monthExpenses = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      monthlyTrend.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: monthIncome,
        expenses: monthExpenses,
        net: monthIncome - monthExpenses
      });
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalIncome,
          totalExpenses,
          netAmount,
          totalSavings,
          monthlySavings
        },
        categoryBreakdown: emiTypeBreakdown,
        recentTransactions: recentTransactions,
        monthlyTrend
      }
    });
  } catch (error) {
    console.error('Dashboard report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating dashboard report'
    });
  }
});

// @desc    Get spending analysis
// @route   GET /api/reports/spending
// @access  Private
router.get('/spending', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = { user: req.user.id, type: 'expense' };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .sort({ date: -1 });

    // Group by EMI type
    const emiTypeSpending = {};
    transactions.forEach(transaction => {
      // Extract EMI type from description or tags
      let emiType = 'Other';
      let color = '#6c757d'; // Default gray color
      
      if (transaction.description && transaction.description.includes('EMI Payment:')) {
        // Extract EMI type from description
        const emiMatch = transaction.description.match(/EMI Payment: (.+)/);
        if (emiMatch) {
          emiType = emiMatch[1];
          
          // Assign colors based on EMI type
          if (emiType.includes('One Card')) {
            color = '#fd5d93'; // Pink for credit card
          } else if (emiType.includes('S24 ultra mobile')) {
            color = '#00d25b'; // Green for mobile
          } else if (emiType.includes('Ather')) {
            color = '#1d8cf8'; // Blue for bike
          } else if (emiType.includes('Cheetu')) {
            color = '#9c27b0'; // Purple for cheetu
          } else if (emiType.includes('EMI')) {
            color = '#ff8d72'; // Orange for general EMI
          }
        }
      } else if (transaction.tags && transaction.tags.includes('emi')) {
        // Check tags for EMI type
        if (transaction.tags.includes('one-card')) {
          emiType = 'One Card EMI';
          color = '#fd5d93';
        } else if (transaction.tags.includes('s24-ultra')) {
          emiType = 'S24 Ultra Mobile EMI';
          color = '#00d25b';
        } else if (transaction.tags.includes('ather')) {
          emiType = 'Ather Bike EMI';
          color = '#1d8cf8';
        } else if (transaction.tags.includes('cheetu')) {
          emiType = 'Cheetu EMI';
          color = '#9c27b0';
        } else {
          emiType = 'Other EMI';
          color = '#ff8d72';
        }
      } else {
        emiType = 'Other Expenses';
        color = '#6c757d';
      }

      if (!emiTypeSpending[emiType]) {
        emiTypeSpending[emiType] = {
          total: 0,
          count: 0,
          color: color,
          transactions: []
        };
      }
      emiTypeSpending[emiType].total += transaction.amount;
      emiTypeSpending[emiType].count += 1;
      emiTypeSpending[emiType].transactions.push(transaction);
    });

    // Convert to array and sort by total
    const spendingArray = Object.entries(emiTypeSpending).map(([name, data]) => ({
      name,
      ...data
    })).sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        totalSpending: transactions.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: transactions.length,
        categoryBreakdown: spendingArray
      }
    });
  } catch (error) {
    console.error('Spending analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating spending analysis'
    });
  }
});

// @desc    Get income analysis
// @route   GET /api/reports/income
// @access  Private
router.get('/income', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = { user: req.user.id, type: 'income' };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .sort({ date: -1 });

    // Group by income source/category
    const incomeCategories = {};
    transactions.forEach(transaction => {
      // Categorize income by source
      let incomeCategory = 'Other Income';
      let color = '#6c757d'; // Default gray color
      
      if (transaction.description) {
        const desc = transaction.description.toLowerCase();
        
        // Categorize by common income sources
        if (desc.includes('salary') || desc.includes('payroll') || desc.includes('wage')) {
          incomeCategory = 'Salary';
          color = '#00d25b'; // Green
        } else if (desc.includes('freelance') || desc.includes('contract') || desc.includes('consulting')) {
          incomeCategory = 'Freelance';
          color = '#1d8cf8'; // Blue
        } else if (desc.includes('business') || desc.includes('profit') || desc.includes('revenue')) {
          incomeCategory = 'Business';
          color = '#9c27b0'; // Purple
        } else if (desc.includes('investment') || desc.includes('dividend') || desc.includes('interest')) {
          incomeCategory = 'Investment';
          color = '#ff8d72'; // Orange
        } else if (desc.includes('rent') || desc.includes('property')) {
          incomeCategory = 'Rental Income';
          color = '#fd5d93'; // Pink
        } else if (desc.includes('refund') || desc.includes('cashback') || desc.includes('rebate')) {
          incomeCategory = 'Refunds/Rebates';
          color = '#00bcd4'; // Cyan
        } else if (desc.includes('gift') || desc.includes('bonus') || desc.includes('incentive')) {
          incomeCategory = 'Gifts/Bonuses';
          color = '#4caf50'; // Light Green
        } else {
          incomeCategory = 'Other Income';
          color = '#6c757d'; // Gray
        }
      } else {
        incomeCategory = 'Uncategorized';
        color = '#6c757d';
      }

      if (!incomeCategories[incomeCategory]) {
        incomeCategories[incomeCategory] = {
          total: 0,
          count: 0,
          color: color,
          transactions: []
        };
      }
      incomeCategories[incomeCategory].total += transaction.amount;
      incomeCategories[incomeCategory].count += 1;
      incomeCategories[incomeCategory].transactions.push(transaction);
    });

    // Convert to array and sort by total
    const incomeArray = Object.entries(incomeCategories).map(([name, data]) => ({
      name,
      ...data
    })).sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        totalIncome: transactions.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: transactions.length,
        categoryBreakdown: incomeArray
      }
    });
  } catch (error) {
    console.error('Income analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating income analysis'
    });
  }
});

// @desc    Get EMI payment summary
// @route   GET /api/reports/emi-summary
// @access  Private
router.get('/emi-summary', async (req, res) => {
  try {
    // Get all EMIs for the user, excluding savings_emi type
    const emis = await EMI.find({ 
      user: req.user.id,
      type: { $ne: 'savings_emi' }
    });
    
    // Get all EMI payment transactions (no period filtering)
    const emiTransactions = await Transaction.find({
      user: req.user.id,
      $or: [
        { description: { $regex: /installment/i } },
        { description: { $regex: /EMI Payment/i } },
        { description: { $regex: /Cheetu/i } },
        { description: { $regex: /Cashe/i } },
        { description: { $regex: /True Balance/i } },
        { description: { $regex: /Sangam/i } },
        { description: { $regex: /Suresh/i } }
      ]
    });

         // Calculate EMI summary
     let totalEMIAmount = 0;
     let totalPaidAmount = 0;
     let totalRemainingAmount = 0;
     let activeEMICount = 0;
     let completedEMICount = 0;

           emis.forEach(emi => {
        // Handle full payment EMIs differently
        if (emi.paymentType === 'full_payment') {
          totalEMIAmount += emi.emiAmount; // Full payment amount
          totalRemainingAmount += emi.remainingAmount; // Should be 0 for full payment
        } else {
          totalEMIAmount += emi.emiAmount * emi.totalInstallments; // Regular EMI
          totalRemainingAmount += emi.remainingAmount;
        }
        
        if (emi.status === 'active') {
          activeEMICount++;
        } else if (emi.status === 'completed') {
          completedEMICount++;
        }
      });

     // Calculate total paid amount from EMI model (more accurate)
     const totalPaidFromEMIs = emis.reduce((sum, emi) => sum + (emi.emiAmount * emi.paidInstallments), 0);
     
     // Also get from transactions as backup
     const totalPaidFromTransactions = emiTransactions.reduce((sum, tx) => sum + tx.amount, 0);
     
     // Use the higher value between EMI model and transactions
     totalPaidAmount = Math.max(totalPaidFromEMIs, totalPaidFromTransactions);

         // Get EMI breakdown by type
     const emiBreakdown = {};
           emis.forEach(emi => {
        const type = emi.type;
        if (!emiBreakdown[type]) {
          emiBreakdown[type] = {
            count: 0,
            totalAmount: 0,
            paidAmount: 0,
            remainingAmount: 0,
            emis: []
          };
        }
        
        // Handle full payment EMIs differently
        let emiTotalAmount, emiPaidAmount;
        if (emi.paymentType === 'full_payment') {
          emiTotalAmount = emi.emiAmount; // Full payment amount
          emiPaidAmount = emi.emiAmount; // Full payment is fully paid
        } else {
          emiTotalAmount = emi.emiAmount * emi.totalInstallments; // Regular EMI
          emiPaidAmount = emi.emiAmount * emi.paidInstallments;
        }
        
        emiBreakdown[type].count++;
        emiBreakdown[type].totalAmount += emiTotalAmount;
        emiBreakdown[type].paidAmount += emiPaidAmount;
        emiBreakdown[type].remainingAmount += emi.remainingAmount;
        emiBreakdown[type].emis.push({
          id: emi._id,
          name: emi.name,
          emiAmount: emi.emiAmount,
          totalInstallments: emi.totalInstallments,
          paidInstallments: emi.paidInstallments,
          remainingAmount: emi.remainingAmount,
          status: emi.status,
          nextDueDate: emi.nextDueDate,
          paymentType: emi.paymentType
        });
      });

    // Convert to array
    const emiBreakdownArray = Object.entries(emiBreakdown).map(([type, data]) => ({
      type,
      ...data
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalEMIAmount,
          totalPaidAmount,
          totalRemainingAmount,
          activeEMICount,
          completedEMICount,
          totalEMICount: emis.length
        },
        emiBreakdown: emiBreakdownArray,
        recentEMIPayments: emiTransactions.slice(0, 10).map(tx => ({
          id: tx._id,
          amount: tx.amount,
          description: tx.description,
          date: tx.date,
          type: tx.type
        }))
      }
    });
  } catch (error) {
    console.error('EMI summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating EMI summary'
    });
  }
});

// @desc    Get upcoming payments (including savings_emi)
// @route   GET /api/reports/upcoming-payments
// @access  Private
router.get('/upcoming-payments', async (req, res) => {
  try {
    // Get all EMIs for the user, including savings_emi but excluding full payment
    const emis = await EMI.find({ 
      user: req.user.id,
      paymentType: { $ne: 'full_payment' }
    });
    
    // Get EMI breakdown by type for upcoming payments
    const emiBreakdown = {};
    emis.forEach(emi => {
      const type = emi.type;
      if (!emiBreakdown[type]) {
        emiBreakdown[type] = {
          count: 0,
          totalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
          emis: []
        };
      }
      
      // Handle regular EMIs
      let emiTotalAmount, emiPaidAmount;
      emiTotalAmount = emi.emiAmount * emi.totalInstallments;
      emiPaidAmount = emi.emiAmount * emi.paidInstallments;
      
      emiBreakdown[type].count++;
      emiBreakdown[type].totalAmount += emiTotalAmount;
      emiBreakdown[type].paidAmount += emiPaidAmount;
      emiBreakdown[type].remainingAmount += emi.remainingAmount;
      emiBreakdown[type].emis.push({
        id: emi._id,
        name: emi.name,
        emiAmount: emi.emiAmount,
        totalInstallments: emi.totalInstallments,
        paidInstallments: emi.paidInstallments,
        remainingAmount: emi.remainingAmount,
        status: emi.status,
        nextDueDate: emi.nextDueDate,
        endDate: emi.endDate,
        paymentType: emi.paymentType
      });
    });

    // Convert to array
    const emiBreakdownArray = Object.entries(emiBreakdown).map(([type, data]) => ({
      type,
      ...data
    }));

    res.json({
      success: true,
      data: {
        emiBreakdown: emiBreakdownArray
      }
    });
  } catch (error) {
    console.error('Upcoming payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating upcoming payments'
    });
  }
});

module.exports = router;
