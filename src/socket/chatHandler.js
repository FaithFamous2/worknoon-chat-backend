const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

const setupChatHandlers = (io, socket) => {
  const userId = socket.userId;

  // Join conversation room
  socket.on('join_conversation', async (data) => {
    try {
      const { conversationId } = data;
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );

      if (!isParticipant && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Not a participant of this conversation' });
        return;
      }

      socket.join(conversationId);
      socket.emit('joined_conversation', { conversationId });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Leave conversation room
  socket.on('leave_conversation', (data) => {
    const { conversationId } = data;
    socket.leave(conversationId);
    socket.emit('left_conversation', { conversationId });
  });

  // Send message
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, attachments } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );

      if (!isParticipant) {
        socket.emit('error', { message: 'Not a participant' });
        return;
      }

      if (conversation.status !== 'active') {
        socket.emit('error', { message: 'Conversation is not active' });
        return;
      }

      const message = await Message.create({
        conversationId,
        senderId: userId,
        content,
        attachments: attachments || [],
      });

      // Update conversation last message
      conversation.lastMessage = {
        content,
        senderId: userId,
        timestamp: message.createdAt,
      };

      // Increment unread counts for other participants
      conversation.participants.forEach((p) => {
        if (p.userId.toString() !== userId) {
          p.unreadCount += 1;
        }
      });

      await conversation.save();

      await message.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

      // Emit to all users in the conversation room
      io.to(conversationId).emit('message_received', { message });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Typing indicators
  socket.on('typing_start', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('user_typing', {
      userId,
      firstName: socket.user.profile.firstName,
      conversationId,
      isTyping: true,
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('user_typing', {
      userId,
      conversationId,
      isTyping: false,
    });
  });

  // Mark messages as read
  socket.on('mark_read', async (data) => {
    try {
      const { conversationId, messageIds } = data;

      const updateResult = await Message.updateMany(
        {
          _id: { $in: messageIds },
          'readBy.userId': { $ne: userId },
        },
        {
          $push: { readBy: { userId, readAt: new Date() } },
          $set: { status: 'read' },
        }
      );

      // Reset unread count
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        const participant = conversation.participants.find(
          (p) => p.userId.toString() === userId
        );
        if (participant) {
          participant.unreadCount = 0;
        }
        await conversation.save();
      }

      io.to(conversationId).emit('messages_read', {
        userId,
        conversationId,
        messageIds,
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
};

module.exports = { setupChatHandlers };
