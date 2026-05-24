const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['message', 'conversation', 'system', 'chat_assigned', 'chat_transferred', 'support_request'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    data: {
      conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      senderName: String,
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
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

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
