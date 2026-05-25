const mongoose = require('mongoose');
const crypto = require('crypto');

const masterTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Generate a new unique token
masterTokenSchema.statics.generateToken = function () {
  return 'wnt_' + crypto.randomBytes(32).toString('hex');
};

// Hash token before saving (so raw token is stored only once)
masterTokenSchema.pre('save', function () {
  if (this.isModified('token') && !this.token.startsWith('wnt_')) {
    throw new Error('Token must start with wnt_');
  }
});

// Exclude __v from JSON
masterTokenSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('MasterToken', masterTokenSchema);
