# Worknoon Chat Backend

A real-time chat backend built with Node.js, Express, and MongoDB for eCommerce platforms. Enables communication between customers, support agents, designers, and merchants.

## Features

### Core Features
- **JWT Authentication**: Secure signup/login with role-based access
- **User Roles**: admin, agent, customer, designer, merchant
- **Real-time Messaging**: Socket.IO for instant message delivery
- **CRUD Operations**: Full management of conversations and messages
- **Read/Unread Status**: Track message status and timestamps

### Bonus Features Implemented
- **Typing Indicators**: Real-time typing status
- **Online Status**: Show when users are online/offline
- **File Uploads**: Cloudinary integration for images, videos, and documents
- **Email Notifications**: Resend integration for new messages and chat assignments
- **Chat Transfer**: Agents can transfer chats to other agents, merchants, or designers
- **Customer Support Flow**: Auto-assign customers to available agents

## Tech Stack

- **Node.js**: Runtime environment
- **Express**: Web framework
- **MongoDB**: Database with Mongoose ODM
- **Socket.IO**: Real-time bidirectional communication
- **JWT**: Authentication tokens
- **Cloudinary**: File storage and management
- **Resend**: Email service provider
- **Bcrypt**: Password hashing
- **CORS**: Cross-origin resource sharing

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file (see `.env.example`)
4. Start the server:
   ```bash
   npm run dev
   ```

## Environment Variables

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/worknoon-chat
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Resend
RESEND_API_KEY=your-resend-api-key
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - List all users (admin only)
- `POST /api/users` - Create user (admin only)
- `GET /api/users/available` - Get available users for chat
- `GET /api/users/agents` - Get available agents

### Conversations
- `GET /api/conversations` - Get user's conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get conversation details
- `POST /api/conversations/:id/transfer` - Transfer chat to another user
- `POST /api/conversations/:id/close` - Close conversation

### Messages
- `GET /api/messages/:conversationId` - Get conversation messages
- `POST /api/messages` - Send new message
- `POST /api/messages/:id/read` - Mark message as read

### Uploads
- `POST /api/upload/single` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files

### Notifications
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/:id/read` - Mark notification as read
- `DELETE /api/notifications` - Clear all notifications

## Socket.IO Events

### Client to Server
- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_read` - Mark messages as read
- `initiate_support_chat` - Start customer support chat
- `accept_chat` - Accept assigned chat
- `transfer_chat` - Transfer chat to another user
- `get_online_users` - Get online users in conversation

### Server to Client
- `message_received` - New message received
- `user_typing` - User typing status
- `messages_read` - Messages marked as read
- `chat_assigned` - Chat assigned to agent
- `support_chat_created` - Support chat created
- `chat_transferred` - Chat transferred
- `chat_transferred_to_you` - Chat transferred to current user
- `user_online` - User came online
- `user_offline` - User went offline
- `online_users` - List of online users
- `notification` - New notification
- `error` - Error message

## File Structure

```
worknoon-chat-backend/
├── server.js                 # Entry point
├── package.json              # Dependencies
├── .env                      # Environment variables
├── .env.example              # Example environment file
├── src/
│   ├── app.js               # Express app setup
│   ├── config/
│   │   ├── db.js            # Database connection
│   │   └── env.js           # Environment configuration
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── conversation.controller.js
│   │   ├── message.controller.js
│   │   ├── notification.controller.js
│   │   ├── upload.controller.js
│   │   └── user.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── role.middleware.js
│   │   └── validate.middleware.js
│   ├── models/
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   ├── Notification.js
│   │   └── User.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── conversation.routes.js
│   │   ├── message.routes.js
│   │   ├── notification.routes.js
│   │   ├── upload.routes.js
│   │   └── user.routes.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── cloudinary.service.js
│   │   ├── email.service.js
│   │   └── socket.service.js
│   ├── socket/
│   │   └── chatHandler.js    # Socket.IO event handlers
│   └── utils/
│       ├── errors.js         # Custom error classes
│       ├── jwt.js            # JWT utilities
│       └── response.js       # Response helpers
```

## User Roles

- **admin**: Full system access
- **agent**: Customer support agent
- **customer**: End customer
- **designer**: Product designer
- **merchant**: Store merchant

## Chat Features

### Customer to Agent Flow
1. Customer initiates support chat
2. System auto-assigns to available online agent
3. If no agents online, assigns to agent with least active chats
4. Agent receives notification and email
5. Real-time messaging begins

### Chat Transfer
- Agents can transfer chats to other agents
- Can transfer to merchants or designers
- System message added showing transfer details
- New participant receives notification

### File Uploads
- Images: JPEG, PNG, GIF, WebP, SVG
- Videos: MP4, WebM, MOV, AVI, MKV
- Documents: PDF, DOC, DOCX, TXT, XLS, XLSX, PPT, PPTX
- Max file size: 50MB
- Cloudinary storage with local fallback

## Security

- JWT token authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization
- CORS configuration
- Secure file upload validation

## Error Handling

Custom error classes:
- `AppError`: Base error class
- `BadRequestError`: 400 errors
- `UnauthorizedError`: 401 errors
- `ForbiddenError`: 403 errors
- `NotFoundError`: 404 errors
- `ConflictError`: 409 errors

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Production Deployment

```bash
# Set NODE_ENV to production
export NODE_ENV=production

# Start server
npm start
```

## License

MIT

## Support

For support, please contact: careers@worknoon.com
