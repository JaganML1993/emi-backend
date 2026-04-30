const mongoose = require('mongoose');

const landSavingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    planMonthIndex: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
    },
    amountTransferred: {
      type: Number,
      required: [true, 'Amount is required'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
  },
  { timestamps: true }
);

landSavingsSchema.index({ user: 1, planMonthIndex: 1 }, { unique: true });

module.exports = mongoose.model('LandSavings', landSavingsSchema);
