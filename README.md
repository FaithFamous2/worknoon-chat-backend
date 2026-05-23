# Worknoon Chat Backend

Real-time chat backend API for the Worknoon eCommerce platform. Supports conversations between customers, agents, designers, and merchants with JWT authentication, Socket.IO real-time messaging, and file upload capabilities.

## 🚀 Features

### Core Features
- ✅ **JWT Authentication** - Sign up, login, token refresh, logout
- ✅ **User Roles** - Admin, Agent, Customer, Designer, Merchant
- ✅ **Real-time Messaging** - Socket.IO powered instant messaging
- ✅ **Conversation CRUD** - Create, read, update, archive conversations
- ✅ **Message CRUD** - Send, list, mark as read with cursor-based pagination
- ✅ **Read/Unread Status** - Track message read receipts per participant
- ✅ **Timestamps** - Full timestamp tracking for messages and conversations

### Bonus Features
- ✅ **Typing Indicators** - Real-time typing status broadcasting
- ✅ **Online Status** - Track user online/offline status
- ✅ **File Uploads** - Image compression via Sharp, file type validation
- ✅ **Role-Based Access** - Granular permission control per endpoint
- ✅ **Rate Limiting** - API protection against abuse
- ✅ **Security Headers** - Helmet middleware for HTTP security

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **Express.js** | Web framework |
| **MongoDB + Mongoose** | Database & ODM |
| **Socket.IO** | Real-time bidirectional communication |
| **JWT (jsonwebtoken)** | Authentication & authorization |
| **bcryptjs** | Password hashing |
| **Multer + Sharp** | File upload & image compression |
| **express-validator** | Input validation |
| **Helmet + CORS + Rate-Limit** | Security |

## 📋 Prerequisites

- **Node.js** v18 or higher
- **MongoDB** v6 or higher (local or Atlas)
- **npm** or **yarn** package manager

## 🔧 Installation

### 1. Clone the repository
```bash
git clone https://github.com/worknoon/worknoon-chat-backend.git
cd worknoon-chat-backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/worknoon-chat
JWT_SECRET=your-secure-secret-key
JWT_REFRESH_SECRET=your-secure-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

### 4. Start MongoDB
```bash
# If using local MongoDB
mongod

# Or set MONGODB_URI to your MongoDB Atlas connection string
```

### 5. Run the server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create new account | No |
| POST | `/api/auth/login` | Login to account | No |
| POST | `/api/auth/refresh` | Refresh access token | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/logout` | Logout user | Yes |

### Users
| Method | Endpoint | Description | Auth | Roles |
|--------|----------|-------------|------|-------|
| GET | `/api/users` | List all users | Yes | Admin |
| GET | `/api/users/:id` | Get user by ID | Yes | All |
| PUT | `/api/users/profile` | Update own profile | Yes | All |

### Conversations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/conversations` | List user's conversations | Yes |
| POST | `/api/conversations` | Create new conversation | Yes |
| GET | `/api/conversations/:id` | Get conversation details | Yes |
| PUT | `/api/conversations/:id` | Update conversation | Yes |
| DELETE | `/api/conversations/:id` | Archive conversation | Yes |

### Messages
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/messages/conversations/:conversationId` | Get messages (paginated) | Yes |
| POST | `/api/messages` | Send a message | Yes |
| PUT | `/api/messages/:messageId/read` | Mark message as read | Yes |

### Files
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/upload` | Upload a file | Yes |

## 🔌 Socket.IO Events

### Client → Server
```javascript
// Join a conversation room
socket.emit('join_conversation', { conversationId });

// Leave a conversation room
socket.emit('leave_conversation', { conversationId });

// Send a message
socket.emit('send_message', {
  conversationId: '...',
  content: 'Hello!',
  attachments: []
});

// Start typing
socket.emit('typing_start', { conversationId });

// Stop typing
socket.emit('typing_stop', { conversationId });

// Mark messages as read
socket.emit('mark_read', {
  conversationId: '...',
  messageIds: ['...', '...']
});
```

### Server → Client
```javascript
// New message received
socket.on('message_received', ({ message }) => {});

// User typing indicator
socket.on('user_typing', ({ userId, firstName, isTyping }) => {});

// User came online
socket.on('user_online', ({ userId }) => {});

// User went offline
socket.on('user_offline', ({ userId }) => {});

// Messages marked as read
socket.on('messages_read', ({ userId, conversationId, messageIds }) => {});
```

## 📁 Project Structure

```
worknoon-chat-backend/
├── src/
│   ├── config/
│   │   ├── db.js              # Database connection
│   │   └── env.js             # Environment configuration
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── conversation.controller.js
│   │   ├── message.controller.js
│   │   ├── upload.controller.js
│   │   └── user.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js  # JWT verification
│   │   ├── role.middleware.js  # Role-based access
│   │   └── validate.middleware.js
│   ├── models/
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   └── User.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── conversation.routes.js
│   │   ├── message.routes.js
│   │   ├── upload.routes.js
│   │   └── user.routes.js
│   ├── services/
│   │   ├── auth.service.js
│   │   └── socket.service.js
│   ├── socket/
│   │   └── chatHandler.js     # Socket.IO event handlers
│   ├── utils/
│   │   ├── errors.js          # Custom error classes
│   │   ├── jwt.js             # Token utilities
│   │   └── response.js        # Response formatters
│   └── app.js                 # Express app setup
├── uploads/                   # Uploaded files directory
├── tests/                     # Test files
├── server.js                  # Entry point
├── .env.example               # Environment template
├── package.json
└── README.md
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

## 🤔 Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Real-time message ordering** | Used MongoDB ObjectId sorting (createdAt) which is monotonically increasing |
| **Unread count accuracy** | Atomic increment operations per message, reset on read receipt |
| **Socket authentication** | JWT verification middleware on Socket.IO handshake |
| **File upload security** | Strict MIME type filtering + file size limits + Sharp compression |
| **Concurrent connections** | Socket.IO room-based broadcasting to specific conversation participants |
| **Data consistency** | Mongoose transactions for critical operations (message + conversation update) |

## 🔜 Future Improvements

- [ ] Redis adapter for Socket.IO horizontal scaling
- [ ] Push notifications via Firebase Cloud Messaging
- [ ] Message encryption (end-to-end)
- [ ] Message search/filter by content
- [ ] Group conversations with multiple participants
- [ ] Webhook integrations for external services
- [ ] Rate limiting per user (not just IP)
- [ ] Swagger/OpenAPI documentation

## 📹 Demo Video

[![Worknoon Chat Backend Demo](https://img.youtube.com/vi/YOUR_VIDEO_ID/0.jpg)](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

*Demo video walkthrough (5-10 minutes) hosted on YouTube/Loom*

## 👨‍💻 Author

**Worknoon** - [careers@worknoon.com](mailto:careers@worknoon.com)

## 📄 License

MIT © Worknoon
