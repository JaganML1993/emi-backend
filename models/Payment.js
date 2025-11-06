const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a payment name'],
    trim: true,
    maxlength: [100, 'Payment name cannot be more than 100 characters']
  },
  emiType: {
    type: String,
    required: true,
    enum: ['ending', 'recurring'],
    default: 'ending'
  },
  category: {
    type: String,
    required: true,
    enum: ['savings', 'expense'],
    default: 'expense'
  },
  emiDay: {
    type: Number,
    required: true,
    min: [1, 'EMI day must be at least 1'],
    max: [31, 'EMI day cannot be more than 31']
  },
  amount: {
    type: Number,
    required: [true, 'Please provide an amount'],
    min: [0, 'Amount cannot be negative']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: function() { return this.emiType === 'ending'; }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'defaulted'],
    default: 'active'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ user: 1, emiType: 1 });
paymentSchema.index({ user: 1, category: 1 });
paymentSchema.index({ user: 1, endDate: 1 });

module.exports = mongoose.model('Payment', paymentSchema);

