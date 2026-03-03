const mongoose = require('mongoose');

const budgetCategorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a category name'],
    trim: true,
    maxlength: [100, 'Category name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot be more than 300 characters']
  },
  color: {
    type: String,
    default: '#60A5FA',
    trim: true
  },
  icon: {
    type: String,
    default: 'icon-wallet-43',
    trim: true
  },
  budgetLimit: {
    type: Number,
    min: [0, 'Budget limit cannot be negative'],
    default: 0
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

budgetCategorySchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('BudgetCategory', budgetCategorySchema);
