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
    const user = socket.user;
    onlineUsers.set(userId, {
      socketId: socket.id,
      userId: userId,
      role: user?.role,
      profile: user?.profile,
    });

    // Broadcast user online to all connected clients
    io.emit('user_online', {
      userId,
      role: user?.role,
      profile: user?.profile,
      isOnline: true,
      timestamp: new Date().toISOString(),
    });

    // Update user status in DB
    User.findByIdAndUpdate(userId, {
      'status.isOnline': true,
      'status.lastSeen': new Date(),
    }).exec();

    // Send current online users list to the newly connected user
    const onlineUserList = Array.from(onlineUsers.values()).map(u => ({
      userId: u.userId,
      role: u.role,
      profile: u.profile,
    }));
    socket.emit('online_users_list', { users: onlineUserList });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);

      // Broadcast user offline to all connected clients
      io.emit('user_offline', {
        userId,
        isOnline: false,
        timestamp: new Date().toISOString(),
      });

      await User.findByIdAndUpdate(userId, {
        'status.isOnline': false,
        'status.lastSeen': new Date(),
      });
    });
  });

  return onlineUsers;
};

module.exports = { authenticateSocket, getOnlineUsers };
