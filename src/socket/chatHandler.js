const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendNewMessageEmail, sendChatAssignedEmail, sendChatTransferEmail } = require('../services/email.service');

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

      // Clear notifications for this conversation when user opens it
      const deleteResult = await Notification.deleteMany({
        userId,
        'data.conversationId': conversationId,
      });

      if (deleteResult.deletedCount > 0) {
        // Emit updated unread count to the user's personal room
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

  // Send message
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, attachments } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      // Check if user is a participant - handle both populated and unpopulated userId
      const isParticipant = conversation.participants.some(
        (p) => {
          const participantUserId = p.userId._id ? p.userId._id.toString() : p.userId.toString();
          return participantUserId === userId;
        }
      );

      // Also allow admins to send messages
      const isAdmin = socket.user.role === 'admin';

      if (!isParticipant && !isAdmin) {
        socket.emit('error', { message: 'Not a participant' });
        return;
      }

      if (conversation.status !== 'active' && conversation.status !== 'pending') {
        socket.emit('error', { message: 'Conversation is not active' });
        return;
      }

      // Validate that at least content or attachments is provided
      const hasContent = content && content.trim().length > 0;
      const hasAttachments = attachments && attachments.length > 0;

      if (!hasContent && !hasAttachments) {
        socket.emit('error', { message: 'Message must have content or attachments' });
        return;
      }

      // If no content but has attachments, use first attachment name as content
      let messageContent = content || '';
      if (!hasContent && hasAttachments && attachments.length > 0) {
        messageContent = attachments[0].name || 'Attachment';
      }

      console.log('Creating message with attachments:', { conversationId, content: messageContent, attachments: attachments || [] });

      // Validate attachments before saving
      const validAttachments = (attachments || []).filter(att => att && att.url && att.type && att.name);
      console.log('Valid attachments to save:', validAttachments.length);

      const message = await Message.create({
        conversationId,
        senderId: userId,
        content: messageContent,
        attachments: validAttachments,
        status: 'sent',
      });

      console.log('Message created:', message._id);
      console.log('Message attachments saved:', JSON.stringify(message.attachments, null, 2));
      console.log('Attachment count in DB:', message.attachments?.length);

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

      // Create notifications for other participants
      const senderName = socket.user.profile?.firstName
        ? `${socket.user.profile.firstName} ${socket.user.profile.lastName || ''}`.trim()
        : socket.user.email;

      const otherParticipants = conversation.participants.filter(
        (p) => p.userId.toString() !== userId
      );

      // Create notifications in database and emit via socket
      for (const participant of otherParticipants) {
        const notification = await Notification.create({
          userId: participant.userId,
          type: 'message',
          title: `New message from ${senderName}`,
          content: content.length > 100 ? content.substring(0, 100) + '...' : content,
          data: {
            conversationId,
            senderId: userId,
            senderName,
            messageId: message._id,
          },
        });

        // Emit notification to specific user's room
        io.to(participant.userId.toString()).emit('notification', notification);
        io.to(participant.userId.toString()).emit('new_message_notification', {
          conversationId,
          senderId: userId,
          senderName,
          content,
        });

        // Send email notification if user has email notifications enabled
        const participantUser = await User.findById(participant.userId);
        if (participantUser?.settings?.notifications?.email !== false) {
          const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversationId}`;
          await sendNewMessageEmail({
            to: participantUser.email,
            senderName,
            messageContent: content,
            conversationId,
            conversationUrl,
          });
        }
      }

      // Populate sender info before emitting
      await message.populate('senderId', 'email role profile.firstName profile.lastName profile.avatar');

      console.log('Emitting message to conversation:', conversationId);
      console.log('Message to emit:', JSON.stringify({
        _id: message._id,
        content: message.content,
        attachments: message.attachments,
        senderId: message.senderId?._id || message.senderId,
      }, null, 2));

      // Emit to all users in the conversation room with explicit status
      const messageToEmit = {
        ...message.toObject(),
        status: 'sent',
      };

      console.log('Final message object being emitted:', JSON.stringify(messageToEmit, null, 2));

      // Use socket.broadcast.to to emit to everyone EXCEPT the sender
      // This prevents the sender from receiving their own message back via socket
      // (they already have the optimistic message)
      socket.broadcast.to(conversationId).emit('message_received', {
        message: messageToEmit,
      });

      // Also emit to the sender separately with the confirmed message
      // This allows the sender to replace their optimistic message with the confirmed one
      socket.emit('message_received', {
        message: messageToEmit,
      });

      console.log('Message emitted to room (broadcast) and sender (direct):', conversationId);
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

  // Mark messages as read
  socket.on('mark_read', async (data) => {
    try {
      const { conversationId, messageIds } = data;

      // Add current user to readBy for each message and update status
      const readMessages = [];
      for (const messageId of messageIds) {
        const message = await Message.findById(messageId);
        if (!message) continue;

        const alreadyRead = message.readBy.some(
          (r) => r.userId.toString() === userId
        );

        if (!alreadyRead) {
          message.readBy.push({ userId, readAt: new Date() });

          // Determine new status: 'read' if all participants have read, else 'delivered'
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            const allParticipantsRead = conversation.participants.every(
              (p) =>
                message.readBy.some(
                  (r) => r.userId.toString() === p.userId.toString()
                ) || p.userId.toString() === message.senderId.toString()
            );
            if (allParticipantsRead) {
              message.status = 'read';
            } else if (message.status === 'sent') {
              message.status = 'delivered';
            }
          }

          await message.save();
          readMessages.push({
            _id: message._id,
            status: message.status,
          });
        }
      }

      // Reset unread count for this user in conversation
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

      // Clear notifications for this conversation when messages are read
      const deleteResult = await Notification.deleteMany({
        userId,
        'data.conversationId': conversationId,
      });

      if (deleteResult.deletedCount > 0) {
        const unreadCount = await Notification.countDocuments({ userId, read: false });
        io.to(userId).emit('unread_count_updated', { count: unreadCount });
        io.to(userId).emit('notifications_cleared', { conversationId, deletedCount: deleteResult.deletedCount });
      }

      // Broadcast updated message statuses to everyone in the conversation room
      io.to(conversationId).emit('messages_read', {
        userId,
        conversationId,
        messageIds,
        readMessages,
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Customer initiates support chat - auto-assign to available agent
  socket.on('initiate_support_chat', async (data) => {
    try {
      const { message: initialMessage, context } = data;

      // Find available agents (online agents)
      const availableAgents = await User.find({
        role: 'agent',
        'status.isOnline': true,
      }).sort({ 'status.lastSeen': -1 });

      let assignedAgent = null;

      if (availableAgents.length > 0) {
        // Assign to first available agent
        assignedAgent = availableAgents[0];
      } else {
        // If no online agents, find any agent with least active conversations
        const agents = await User.find({ role: 'agent' });
        if (agents.length > 0) {
          // Get conversation counts for each agent
          const agentConversationCounts = await Promise.all(
            agents.map(async (agent) => {
              const count = await Conversation.countDocuments({
                'participants.userId': agent._id,
                status: 'active',
              });
              return { agent, count };
            })
          );

          // Sort by conversation count (ascending)
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

      // Create notification for agent
      const notification = await Notification.create({
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
      });

      // Emit to agent's room
      io.to(assignedAgent._id.toString()).emit('chat_assigned', {
        conversation,
        notification,
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

      // Send email notification to agent
      if (assignedAgent.settings?.notifications?.email !== false) {
        const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversation._id}`;
        await sendChatAssignedEmail({
          to: assignedAgent.email,
          customerName,
          conversationId: conversation._id,
          conversationUrl,
        });
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

  // Agent accepts a chat (for cases where chat is pending acceptance)
  socket.on('accept_chat', async (data) => {
    try {
      const { conversationId } = data;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }

      // Check if user is an agent
      if (socket.user.role !== 'agent' && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Only agents can accept chats' });
        return;
      }

      // Check if already a participant
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

      // Notify the accepting agent
      socket.emit('chat_accepted', {
        conversation,
      });
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

      // Check if current user is a participant
      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === userId
      );

      if (!isParticipant && socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Not authorized to transfer this chat' });
        return;
      }

      // Find target user
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        socket.emit('error', { message: 'Target user not found' });
        return;
      }

      // Check if target user is already a participant
      const isTargetParticipant = conversation.participants.some(
        (p) => p.userId.toString() === targetUserId
      );

      if (isTargetParticipant) {
        socket.emit('error', { message: 'Target user is already a participant in this chat' });
        return;
      }

      // Remove current user from participants (optional - they can stay as observer)
      // For now, we'll keep them in the conversation but mark as transferred

      // Add target user to participants
      conversation.participants.push({
        userId: targetUserId,
        role: targetUser.role,
        unreadCount: 1, // They have unread messages
      });

      // Add transfer metadata
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

      // Create notification for target user
      const transferrerName = socket.user.profile?.firstName
        ? `${socket.user.profile.firstName} ${socket.user.profile.lastName || ''}`.trim()
        : socket.user.email;

      const customerParticipant = conversation.participants.find(
        (p) => p.role === 'customer'
      );
      const customerName = customerParticipant?.userId?.profile?.firstName
        ? `${customerParticipant.userId.profile.firstName} ${customerParticipant.userId.profile.lastName || ''}`.trim()
        : 'Customer';

      const notification = await Notification.create({
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
      });

      // Emit to target user
      io.to(targetUserId).emit('chat_transferred_to_you', {
        conversation,
        notification,
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

      // Send email notification to target user
      if (targetUser.settings?.notifications?.email !== false) {
        const conversationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox/${conversationId}`;
        await sendChatTransferEmail({
          to: targetUser.email,
          transferFrom: transferrerName,
          customerName,
          conversationId,
          conversationUrl,
        });
      }

      // Notify the transferrer
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

      // Get all sockets in the conversation room
      const room = io.sockets.adapter.rooms.get(conversationId);
      const onlineUserIds = room ? Array.from(room) : [];

      // Get user details for online users
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
