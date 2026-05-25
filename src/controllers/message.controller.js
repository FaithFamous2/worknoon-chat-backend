const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { successResponse, paginatedResponse } = require('../utils/response');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');

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
      (p) => p.userId.toString() === req.userId.toString()
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

    // Debug: Log messages with attachments
    const messagesWithAttachments = messages.filter(m => m.attachments && m.attachments.length > 0);
    console.log(`Found ${messagesWithAttachments.length} messages with attachments out of ${messages.length} total`);

    // Transform messages to match frontend expectations
    const transformedMessages = messages.map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      content: msg.content,
      contentType: msg.contentType,
      attachments: msg.attachments,
      status: msg.status,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      sender: msg.senderId ? {
        _id: msg.senderId._id,
        id: msg.senderId._id,
        email: msg.senderId.email,
        role: msg.senderId.role,
        profile: msg.senderId.profile,
        name: msg.senderId.profile ?
          `${msg.senderId.profile.firstName || ''} ${msg.senderId.profile.lastName || ''}`.trim() || msg.senderId.email
          : msg.senderId.email
      } : null
    }));

    successResponse(res, {
      messages: transformedMessages.reverse(),
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
      (p) => p.userId.toString() === req.userId.toString()
    );
    if (!isParticipant) {
      throw new ForbiddenError('Not a participant of this conversation');
    }

    if (conversation.status !== 'active') {
      throw new ForbiddenError('Conversation is not active');
    }

    // Validate that at least content or attachments is provided
    const hasContent = content && content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      throw new BadRequestError('Message must have content or attachments');
    }

    // If no content but has attachments, use first attachment name as content
    let messageContent = content || '';
    if (!hasContent && hasAttachments && attachments.length > 0) {
      messageContent = attachments[0].name || 'Attachment';
    }

    console.log('Creating message with attachments:', { conversationId, content: messageContent, attachments: attachments || [] });

    const message = await Message.create({
      conversationId,
      senderId: req.userId,
      content: messageContent,
      attachments: attachments || [],
    });

    console.log('Message created with attachments:', message._id, 'attachments count:', message.attachments?.length);

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

    // Transform message to match frontend expectations
    const transformedMessage = {
      _id: message._id,
      conversationId: message.conversationId,
      content: message.content,
      contentType: message.contentType,
      attachments: message.attachments,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: message.senderId ? {
        _id: message.senderId._id,
        id: message.senderId._id,
        email: message.senderId.email,
        role: message.senderId.role,
        profile: message.senderId.profile,
        name: message.senderId.profile ?
          `${message.senderId.profile.firstName || ''} ${message.senderId.profile.lastName || ''}`.trim() || message.senderId.email
          : message.senderId.email
      } : null
    };

    successResponse(res, { message: transformedMessage }, 'Message sent successfully', 201);
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
