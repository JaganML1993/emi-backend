const mongoose = require('mongoose');

const budgetExpenseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BudgetCategory',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Please provide an expense title'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Please provide an amount'],
    min: [0, 'Amount cannot be negative']
  },
  date: {
    type: Date,
    required: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'other'],
    default: 'cash'
  }
}, {
  timestamps: true
});

budgetExpenseSchema.index({ user: 1, category: 1 });
budgetExpenseSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('BudgetExpense', budgetExpenseSchema);
