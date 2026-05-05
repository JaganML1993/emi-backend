const mongoose = require('mongoose');

const transferEntrySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

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
    entries: {
      type: [transferEntrySchema],
      default: [],
    },
    /** Legacy single-transfer shape — migrated to entries on GET */
    amountTransferred: Number,
    notes: String,
  },
  { timestamps: true }
);

landSavingsSchema.index({ user: 1, planMonthIndex: 1 }, { unique: true });

module.exports = mongoose.model('LandSavings', landSavingsSchema);
