const mongoose = require('mongoose');

const emiSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide an EMI name'],
    trim: true,
    maxlength: [100, 'EMI name cannot be more than 100 characters']
  },

  type: {
    type: String,
    required: true,
    enum: [
      'personal_loan', 'mobile_emi', 'laptop_emi', 'savings_emi',
      'car_loan', 'home_loan', 'business_loan', 'education_loan',
      'credit_card', 'appliance_emi', 'furniture_emi', 'bike_emi', 'cheetu', 'income_emi', 'other'
    ],
    default: 'other'
  },
  paymentType: {
    type: String,
    required: true,
    enum: ['emi', 'full_payment'],
    default: 'emi'
  },

  emiAmount: {
    type: Number,
    required: function() { return this.paymentType === 'emi'; },
    min: [0, 'EMI amount cannot be negative']
  },
  totalInstallments: {
    type: Number,
    required: function() { return this.paymentType === 'emi'; },
    min: [1, 'Total installments must be at least 1']
  },
  paidInstallments: {
    type: Number,
    default: 0,
    min: [0, 'Paid installments cannot be negative']
  },
  remainingAmount: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  nextDueDate: {
    type: Date,
    required: function() { return this.paymentType === 'emi'; }
  },
  endDate: {
    type: Date,
    required: function() { return this.paymentType === 'emi'; }
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

// Virtual field to calculate total amount
emiSchema.virtual('totalAmount').get(function() {
  if (this.paymentType === 'full_payment') {
    return this.emiAmount;
  }
  return this.emiAmount * this.totalInstallments;
});

// Calculate remaining amount before saving
emiSchema.pre('save', function(next) {
  if (this.paymentType === 'full_payment') {
    this.remainingAmount = 0;
    this.paidInstallments = 1;
    this.totalInstallments = 1;
  } else if (this.isModified('paidInstallments') || this.isModified('emiAmount')) {
    this.remainingAmount = (this.emiAmount * this.totalInstallments) - (this.paidInstallments * this.emiAmount);
  }
  next();
});

// Index for better query performance
emiSchema.index({ user: 1, status: 1 });
emiSchema.index({ user: 1, nextDueDate: 1 });
emiSchema.index({ user: 1, type: 1 });
emiSchema.index({ user: 1, paymentType: 1 });

module.exports = mongoose.model('EMI', emiSchema);
