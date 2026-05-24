const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'agent', 'customer', 'designer', 'merchant'],
      required: true,
    },
    unreadCount: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const transferSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: { type: String, default: '' },
    transferredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [participantSchema],
      validate: {
        validator: function (arr) {
          return arr.length >= 2;
        },
        message: 'Conversation must have at least 2 participants',
      },
    },
    type: {
      type: String,
      enum: {
        values: ['buyer-designer', 'buyer-merchant', 'buyer-agent'],
        message: '{VALUE} is not a valid conversation type',
      },
      required: [true, 'Conversation type is required'],
    },
    context: {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null,
      },
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'archived'],
      default: 'active',
    },
    lastMessage: {
      content: { type: String, default: '' },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      timestamp: { type: Date, default: Date.now },
    },
    transfers: {
      type: [transferSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ 'lastMessage.timestamp': -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
