const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const env = require('./src/config/env');
const { authenticateSocket } = require('./src/services/socket.service');
const { setupChatHandlers } = require('./src/socket/chatHandler');

const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: env.SOCKET_PATH,
});

// Socket.IO authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);

  // Join user's personal room for notifications
  socket.join(socket.userId);

  // Broadcast user online
  socket.broadcast.emit('user_online', { userId: socket.userId });

  // Set up chat event handlers
  setupChatHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
    socket.broadcast.emit('user_offline', { userId: socket.userId });
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    server.listen(env.PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║            Worknoon Chat API Server                    ║
╠════════════════════════════════════════════════════════╣
║  Status:  Running                                      ║
║  Port:    ${String(env.PORT).padEnd(39)}║
║  Env:     ${env.NODE_ENV.padEnd(39)}║
║  Socket:  ${env.SOCKET_PATH.padEnd(39)}║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
