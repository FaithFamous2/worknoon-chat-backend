const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'agent', 'customer', 'designer', 'merchant'],
        message: '{VALUE} is not a valid role',
      },
      default: 'customer',
    },
    profile: {
      firstName: { type: String, trim: true, default: '' },
      lastName: { type: String, trim: true, default: '' },
      avatar: { type: String, default: '' },
      phone: { type: String, trim: true, default: '' },
    },
    status: {
      isOnline: { type: Boolean, default: false },
      lastSeen: { type: Date, default: Date.now },
    },
    settings: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    },
    refreshToken: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.__v;
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
