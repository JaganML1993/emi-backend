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
    
    // Get current month transactions for summary and recent transactions
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const currentMonthTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: currentMonthStart, $lte: currentMonthEnd }
    });
    
    // Get current year transactions for monthly trend
    const yearStart = new Date(currentDate.getFullYear(), 0, 1);
    const yearEnd = new Date(currentDate.getFullYear(), 11, 31);
    
    const yearTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: yearStart, $lte: yearEnd }
    });

    // Calculate totals for current month
    const totalIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netAmount = totalIncome - totalExpenses;

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

    // Get recent transactions for current month (last 5)
    const recentTransactions = await Transaction.find({
      user: req.user.id,
      date: { $gte: currentMonthStart, $lte: currentMonthEnd }
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
      
      const monthIncome = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
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
          netAmount
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

    // Group by EMI type
    const emiTypeIncome = {};
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
      } else if (transaction.type === 'income') {
        emiType = 'Income';
        color = '#00d25b';
      } else {
        emiType = 'Other Expenses';
        color = '#6c757d';
      }

      if (!emiTypeIncome[emiType]) {
        emiTypeIncome[emiType] = {
          total: 0,
          count: 0,
          color: color,
          transactions: []
        };
      }
      emiTypeIncome[emiType].total += transaction.amount;
      emiTypeIncome[emiType].count += 1;
      emiTypeIncome[emiType].transactions.push(transaction);
    });

    // Convert to array and sort by total
    const incomeArray = Object.entries(emiTypeIncome).map(([name, data]) => ({
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
    // Get all EMIs for the user
    const emis = await EMI.find({ user: req.user.id });
    
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
       totalEMIAmount += emi.emiAmount * emi.totalInstallments;
       totalRemainingAmount += emi.remainingAmount;
       
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
       
       const emiPaidAmount = (emi.emiAmount * emi.paidInstallments);
       
       emiBreakdown[type].count++;
       emiBreakdown[type].totalAmount += emi.emiAmount * emi.totalInstallments;
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
         nextDueDate: emi.nextDueDate
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

module.exports = router;
