const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { successResponse, paginatedResponse } = require('../utils/response');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before; // cursor-based pagination

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === req.userId
    );
    if (!isParticipant && req.user.role !== 'admin') {
      throw new ForbiddenError('Not a participant of this conversation');
    }

    const filter = { conversationId };
    if (before) {
      filter._id = { $lt: before };
    }

    const messages = await Message.find(filter)
      .populate('senderId', 'email role profile.firstName profile.lastName profile.avatar')
      .sort({ createdAt: -1 })
      .limit(limit);

    const total = await Message.countDocuments({ conversationId });

    successResponse(res, {
      messages: messages.reverse(),
      hasMore: messages.length === limit,
      total,
    });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, content, attachments } = req.body;

    // Verify conversation exists and user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === req.userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('Not a participant of this conversation');
    }

    if (conversation.status !== 'active') {
      throw new ForbiddenError('Conversation is not active');
    }

    const message = await Message.create({
      conversationId,
      senderId: req.userId,
      content,
      attachments: attachments || [],
    });

    // Update conversation's last message
    conversation.lastMessage = {
      content,
      senderId: req.userId,
      timestamp: message.createdAt,
    };

    // Increment unread counts for other participants
    conversation.participants.forEach((p) => {
      if (p.userId.toString() !== req.userId) {
        p.unreadCount += 1;
      }
    });

    await conversation.save();

    await message.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

    successResponse(res, { message }, 'Message sent successfully', 201);
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Check if already read by this user
    const alreadyRead = message.readBy.some((r) => r.userId.toString() === req.userId);
    if (!alreadyRead) {
      message.readBy.push({ userId: req.userId, readAt: new Date() });

      // Update status to 'read' if all participants have read it
      const conversation = await Conversation.findById(message.conversationId);
      if (conversation) {
        const allParticipantsRead = conversation.participants.every((p) =>
          message.readBy.some((r) => r.userId.toString() === p.userId.toString()) ||
          p.userId.toString() === req.userId
        );
        if (allParticipantsRead) {
          message.status = 'read';
        } else if (message.status === 'sent') {
          message.status = 'delivered';
        }

        // Reset unread count for this user in conversation
        const participant = conversation.participants.find(
          (p) => p.userId.toString() === req.userId
        );
        if (participant) {
          participant.unreadCount = 0;
        }
        await conversation.save();
      }

      await message.save();
    }

    successResponse(res, { message }, 'Message marked as read');
  } catch (error) {
    next(error);
  }
};

module.exports = { getMessages, sendMessage, markAsRead };
