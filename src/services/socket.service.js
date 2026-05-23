const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    socket.userId = user._id.toString();
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
};

const getOnlineUsers = (io) => {
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    const userId = socket.userId;
    onlineUsers.set(userId, socket.id);

    // Broadcast user online
    socket.broadcast.emit('user_online', { userId });

    // Update user status in DB
    User.findByIdAndUpdate(userId, { 'status.isOnline': true, 'status.lastSeen': new Date() }).exec();

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit('user_offline', { userId });

      await User.findByIdAndUpdate(userId, {
        'status.isOnline': false,
        'status.lastSeen': new Date(),
      });
    });
  });

  return onlineUsers;
};

module.exports = { authenticateSocket, getOnlineUsers };
