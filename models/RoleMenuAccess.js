const mongoose = require('mongoose');

const roleMenuAccessSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['super_admin', 'admin', 'user']
  },
  path: {
    type: String,
    required: true,
    trim: true
  },
  allowed: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for unique role+path
roleMenuAccessSchema.index({ role: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('RoleMenuAccess', roleMenuAccessSchema);
