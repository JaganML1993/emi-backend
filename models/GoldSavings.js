const mongoose = require('mongoose');

const goldSavingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Please provide a date']
  },
  grams: {
    type: Number,
    required: [true, 'Please provide weight in grams'],
    min: [0.001, 'Grams must be greater than 0']
  },
  pricePerGram: {
    type: Number,
    required: [true, 'Please provide price per gram'],
    min: [0, 'Price cannot be negative']
  },
  paymentType: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'other'],
    default: 'cash'
  },
  goldType: {
    type: String,
    enum: ['physical', 'digital', 'sgb', 'jewelry', 'other'],
    default: 'physical'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  }
}, {
  timestamps: true
});

goldSavingsSchema.index({ user: 1, date: -1 });
goldSavingsSchema.index({ user: 1, goldType: 1 });

module.exports = mongoose.model('GoldSavings', goldSavingsSchema);
