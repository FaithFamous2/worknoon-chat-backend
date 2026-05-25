const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendNewMessageEmail, sendChatAssignedEmail, sendChatTransferEmail } = require('../services/email.service');

/**
 * Fire notification/email creation asynchronously after emitting the message.
 * This keeps the critical path (message save + emit) as fast as possible.
 */
const fireNotificationAndEmail = async (io, conversationId, userId, socketUser, content, conversation) => {
  try {
    const senderName = socketUser.profile?.firstName
      ? `${socketUser.profile.firstName} ${socketUser.profile.lastName || ''}`.trim()
      : socketUser.email;

    const otherParticipants = conversation.participants.filter(
      (p) => p.userId.toString() !== userId
    );

    for (const participant of otherParticipants) {
      try {
        const notification = await Notification.create({
          userId: participant.userId,
          type: 'message',
          title: `New message from ${senderName}`,
          content: content.length > 100 ? content.substring(0, 100) + '...' : content,
          data: {
            conversationId,
            senderId: userId,
            senderName,
          },
        });

        io.to(participant.userId.toString()).emit('notification', notification);
        io.to(participant.userId.toString()).emit('new_message_notification', {
          conversationId,
          senderId: userId,
          senderName,
          content,
        });

        // Fire email notification without awaiting
        const participantUser = await User.findById(participant.userId).select('email settings.notifications.email').lean();
        if (participantUser && participantUser.settings?.notifications?.email !== false) {
          const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversationId}`;
          sendNewMessageEmail({
            to: participantUser.email,
            senderName,
            messageContent: content,
            conversationId,
            conversationUrl,
          }).catch(() => {}); // Silently fail email
        }
      } catch (err) {
        // Silently fail individual notification - critical path already succeeded
        console.error('Background notification error:', err.message);
      }
    }
  } catch (err) {
    console.error('Background notification batch error:', err.message);
  }
};

const setupChatHandlers = (io, socket) => {
  const userId = socket.userId;

  // Join user room for notifications
  socket.on('join_user_room', (userId) => {
    socket.join(userId);
  });

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

      // Clear notifications for this conversation when user opens it
      const deleteResult = await Notification.deleteMany({
        userId,
        'data.conversationId': conversationId,
      });

      if (deleteResult.deletedCount > 0) {
        const unreadCount = await Notification.countDocuments({ userId, read: false });
        io.to(userId).emit('unread_count_updated', { count: unreadCount });
        io.to(userId).emit('notifications_cleared', { conversationId, deletedCount: deleteResult.deletedCount });
      }
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

  // Send message - OPTIMIZED for speed
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, attachments } = data;

      // Validate that at least content or attachments is provided
      const hasContent = content && content.trim().length > 0;
      const hasAttachments = attachments && attachments.length > 0;
      if (!hasContent && !hasAttachments) {
        socket.emit('error', { message: 'Message must have content or attachments' });
        return;
      }

      // Validate conversation and permissions in parallel
      const conversation = await Conversation.findById(conversationId).lean();
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );
      const isAdmin = socket.user.role === 'admin';

      if (!isParticipant && !isAdmin) {
        socket.emit('error', { message: 'Not a participant' });
        return;
      }

      if (conversation.status !== 'active' && conversation.status !== 'pending') {
        socket.emit('error', { message: 'Conversation is not active' });
        return;
      }

      // If no content but has attachments, use first attachment name as content
      let messageContent = content || '';
      if (!hasContent && hasAttachments && attachments.length > 0) {
        messageContent = attachments[0].name || 'Attachment';
      }

      // Validate attachments before saving
      const validAttachments = (attachments || []).filter(att => att && att.url && att.type && att.name);

      // Create message and update conversation in parallel where possible
      const message = await Message.create({
        conversationId,
        senderId: userId,
        content: messageContent,
        attachments: validAttachments,
        status: 'sent',
      });

      // Populate sender info (needed for the transform below)
      await message.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

      // Transform message to match frontend expectations (sender object instead of senderId)
      const sender = message.senderId ? {
        _id: message.senderId._id,
        id: message.senderId._id,
        email: message.senderId.email,
        role: message.senderId.role,
        profile: message.senderId.profile,
        name: message.senderId.profile ?
          `${message.senderId.profile.firstName || ''} ${message.senderId.profile.lastName || ''}`.trim() || message.senderId.email
          : message.senderId.email
      } : null;

      const messageToEmit = {
        _id: message._id,
        conversationId: message.conversationId,
        content: message.content,
        contentType: message.contentType,
        attachments: message.attachments,
        status: 'sent',
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        sender: sender
      };

      // EMIT IMMEDIATELY - before conversation save, before notifications
      io.to(conversationId).emit('message_received', {
        message: messageToEmit,
      });

      // Update conversation last message and unread counts asynchronously
      // (don't block the response on this)
      Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            'lastMessage': {
              content,
              senderId: userId,
              timestamp: message.createdAt,
            },
          },
          $inc: {
            ...conversation.participants.reduce((acc, p) => {
              if (p.userId.toString() !== userId) {
                acc[`participants.${conversation.participants.indexOf(p)}.unreadCount`] = 1;
              }
              return acc;
            }, {}),
          },
        }
      ).catch(err => console.error('Conversation update error:', err.message));

      // Fire notifications and emails in the background (no await)
      fireNotificationAndEmail(io, conversationId, userId, socket.user, content, conversation)
        .catch(err => console.error('fireNotificationAndEmail failed:', err.message));
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
      lastName: socket.user.profile.lastName,
      conversationId,
      isTyping: true,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('user_typing', {
      userId,
      conversationId,
      isTyping: false,
      timestamp: new Date().toISOString(),
    });
  });

  // Mark messages as read - OPTIMIZED with bulk operations
  socket.on('mark_read', async (data) => {
    try {
      const { conversationId, messageIds } = data;

      // Bulk update all messages at once
      const bulkOps = messageIds.map(messageId => ({
        updateOne: {
          filter: {
            _id: messageId,
            'readBy.userId': { $ne: userId },
          },
          update: {
            $push: { readBy: { userId, readAt: new Date() } },
            $set: { status: 'delivered' },
          },
        },
      }));

      if (bulkOps.length > 0) {
        await Message.bulkWrite(bulkOps);
      }

      // Reset unread count for this user in conversation
      await Conversation.updateOne(
        { _id: conversationId, 'participants.userId': userId },
        { $set: { 'participants.$.unreadCount': 0 } }
      );

      // Clear notifications for this conversation
      const deleteResult = await Notification.deleteMany({
        userId,
        'data.conversationId': conversationId,
      });

      if (deleteResult.deletedCount > 0) {
        const unreadCount = await Notification.countDocuments({ userId, read: false });
        io.to(userId).emit('unread_count_updated', { count: unreadCount });
        io.to(userId).emit('notifications_cleared', { conversationId, deletedCount: deleteResult.deletedCount });
      }

      // Get updated status for each message
      const updatedMessages = await Message.find({ _id: { $in: messageIds } }).select('_id status').lean();

      // Broadcast updated message statuses to everyone in the conversation room
      io.to(conversationId).emit('messages_read', {
        userId,
        conversationId,
        messageIds,
        readMessages: updatedMessages,
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Customer initiates support chat
  socket.on('initiate_support_chat', async (data) => {
    try {
      const { message: initialMessage, context } = data;

      // Find available agents (online agents) - single query
      const availableAgents = await User.find({
        role: 'agent',
        'status.isOnline': true,
      }).sort({ 'status.lastSeen': -1 }).limit(1).lean();

      let assignedAgent = availableAgents[0] || null;

      if (!assignedAgent) {
        // Find any agent with least active conversations
        const agents = await User.find({ role: 'agent' }).lean();
        if (agents.length > 0) {
          const agentConversationCounts = await Promise.all(
            agents.map(async (agent) => {
              const count = await Conversation.countDocuments({
                'participants.userId': agent._id,
                status: 'active',
              });
              return { agent, count };
            })
          );
          agentConversationCounts.sort((a, b) => a.count - b.count);
          assignedAgent = agentConversationCounts[0].agent;
        }
      }

      if (!assignedAgent) {
        socket.emit('error', { message: 'No agents available at the moment. Please try again later.' });
        return;
      }

      // Create conversation
      const conversation = await Conversation.create({
        participants: [
          { userId, role: socket.user.role },
          { userId: assignedAgent._id, role: 'agent' },
        ],
        type: 'buyer-agent',
        context: context || {},
        status: 'active',
      });

      await conversation.populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline');

      // Create initial message
      const message = await Message.create({
        conversationId: conversation._id,
        senderId: userId,
        content: initialMessage,
        attachments: [],
        status: 'sent',
      });

      // Update conversation last message
      conversation.lastMessage = {
        content: initialMessage,
        senderId: userId,
        timestamp: message.createdAt,
      };

      // Increment unread count for agent
      const agentParticipant = conversation.participants.find(
        (p) => p.userId._id.toString() === assignedAgent._id.toString()
      );
      if (agentParticipant) {
        agentParticipant.unreadCount = 1;
      }

      await conversation.save();
      await message.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

      // Notify the assigned agent
      const customerName = socket.user.profile?.firstName
        ? `${socket.user.profile.firstName} ${socket.user.profile.lastName || ''}`.trim()
        : socket.user.email;

      // Create notification for agent in background
      Notification.create({
        userId: assignedAgent._id,
        type: 'chat_assigned',
        title: `New support chat from ${customerName}`,
        content: initialMessage.length > 100 ? initialMessage.substring(0, 100) + '...' : initialMessage,
        data: {
          conversationId: conversation._id,
          senderId: userId,
          senderName: customerName,
          messageId: message._id,
        },
      }).catch(() => {});

      // Emit to agent's room
      io.to(assignedAgent._id.toString()).emit('chat_assigned', {
        conversation,
        notification: null, // Notification created in background
        customerName,
        initialMessage,
      });

      // Emit to customer
      socket.emit('support_chat_created', {
        conversation,
        message,
        assignedAgent: {
          _id: assignedAgent._id,
          email: assignedAgent.email,
          profile: assignedAgent.profile,
          status: assignedAgent.status,
        },
      });

      // Send email notification to agent in background
      if (assignedAgent.settings?.notifications?.email !== false) {
        const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversation._id}`;
        sendChatAssignedEmail({
          to: assignedAgent.email,
          customerName,
          conversationId: conversation._id,
          conversationUrl,
        }).catch(() => {});
      }

      // Join the customer to the conversation room
      socket.join(conversation._id.toString());

      // Emit the message to the conversation room
      io.to(conversation._id.toString()).emit('message_received', {
        message: {
          ...message.toObject(),
          status: 'sent',
        },
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Agent accepts a chat
  socket.on('accept_chat', async (data) => {
    try {
      const { conversationId } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      if (socket.user.role !== 'agent' && socket.user.role !== 'merchant' && socket.user.role !== 'designer' && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Only agents, merchants, designers, and admins can accept chats' });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );

      if (isParticipant) {
        socket.emit('error', { message: 'You are already a participant in this chat' });
        return;
      }

      // Add agent to participants
      conversation.participants.push({
        userId,
        role: socket.user.role,
        unreadCount: 0,
      });

      await conversation.save();
      await conversation.populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline');

      // Join the conversation room
      socket.join(conversationId);

      // Notify all participants about the new agent
      io.to(conversationId).emit('agent_joined', {
        conversationId,
        agent: {
          _id: socket.user._id,
          email: socket.user.email,
          profile: socket.user.profile,
          role: socket.user.role,
        },
      });

      socket.emit('chat_accepted', { conversation });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Transfer chat to another user (agent, merchant, or designer)
  socket.on('transfer_chat', async (data) => {
    try {
      const { conversationId, targetUserId, reason } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );

      if (!isParticipant && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Not authorized to transfer this chat' });
        return;
      }

      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        socket.emit('error', { message: 'Target user not found' });
        return;
      }

      const isTargetParticipant = conversation.participants.some(
        (p) => p.userId.toString() === targetUserId
      );

      if (isTargetParticipant) {
        socket.emit('error', { message: 'Target user is already a participant in this chat' });
        return;
      }

      // Add target user to participants
      conversation.participants.push({
        userId: targetUserId,
        role: targetUser.role,
        unreadCount: 1,
      });

      conversation.transfers = conversation.transfers || [];
      conversation.transfers.push({
        from: userId,
        to: targetUserId,
        reason: reason || 'No reason provided',
        transferredAt: new Date(),
      });

      await conversation.save();
      await conversation.populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline');

      // Create system message about transfer
      const transferMessage = await Message.create({
        conversationId,
        senderId: userId,
        content: `Chat transferred to ${targetUser.profile?.firstName || targetUser.email} ${reason ? `(${reason})` : ''}`,
        isSystemMessage: true,
        attachments: [],
        status: 'sent',
      });

      await transferMessage.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

      const transferrerName = socket.user.profile?.firstName
        ? `${socket.user.profile.firstName} ${socket.user.profile.lastName || ''}`.trim()
        : socket.user.email;

      const customerParticipant = conversation.participants.find(
        (p) => p.role === 'customer'
      );
      const customerName = customerParticipant?.userId?.profile?.firstName
        ? `${customerParticipant.userId.profile.firstName} ${customerParticipant.userId.profile.lastName || ''}`.trim()
        : 'Customer';

      // Create notification in background
      Notification.create({
        userId: targetUserId,
        type: 'chat_transferred',
        title: `Chat transferred from ${transferrerName}`,
        content: `A chat with ${customerName} has been transferred to you${reason ? `: ${reason}` : ''}`,
        data: {
          conversationId,
          transferredFrom: userId,
          transferredBy: transferrerName,
          customerName,
          reason,
        },
      }).catch(() => {});

      // Emit to target user
      io.to(targetUserId).emit('chat_transferred_to_you', {
        conversation,
        notification: null,
        transferredBy: {
          _id: socket.user._id,
          name: transferrerName,
          role: socket.user.role,
        },
        reason,
      });

      // Emit to conversation room
      io.to(conversationId).emit('chat_transferred', {
        conversationId,
        transferredTo: {
          _id: targetUser._id,
          email: targetUser.email,
          profile: targetUser.profile,
          role: targetUser.role,
        },
        transferredBy: {
          _id: socket.user._id,
          name: transferrerName,
          role: socket.user.role,
        },
        reason,
        systemMessage: transferMessage,
      });

      // Send email in background
      if (targetUser.settings?.notifications?.email !== false) {
        const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversationId}`;
        sendChatTransferEmail({
          to: targetUser.email,
          transferFrom: transferrerName,
          customerName,
          conversationId,
          conversationUrl,
        }).catch(() => {});
      }

      socket.emit('chat_transfer_success', {
        conversation,
        targetUser: {
          _id: targetUser._id,
          email: targetUser.email,
          profile: targetUser.profile,
        },
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Get online users in a conversation
  socket.on('get_online_users', async (data) => {
    try {
      const { conversationId } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      const onlineUsers = await User.find({
        _id: { $in: conversation.participants.map(p => p.userId) },
        'status.isOnline': true,
      }).select('email profile.firstName profile.lastName status.isOnline status.lastSeen');

      socket.emit('online_users', {
        conversationId,
        onlineUsers: onlineUsers.map(u => ({
          _id: u._id,
          email: u.email,
          profile: u.profile,
          status: u.status,
        })),
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
};

module.exports = { setupChatHandlers };
