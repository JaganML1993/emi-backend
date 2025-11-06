const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  paymentDate: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative']
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  paidDate: {
    type: Date
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
paymentTransactionSchema.index({ user: 1, status: 1 });
paymentTransactionSchema.index({ user: 1, paymentDate: 1 });
paymentTransactionSchema.index({ user: 1, month: 1, year: 1 });
paymentTransactionSchema.index({ user: 1, payment: 1 });
paymentTransactionSchema.index({ paymentDate: 1 });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);

