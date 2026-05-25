const MasterToken = require('../models/MasterToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { successResponse, paginatedResponse, errorResponse } = require('../utils/response');

// ───────── Admin Token Management ─────────

const createToken = async (req, res, next) => {
  try {
    if (req.userRole !== 'admin') {
      return errorResponse(res, 'Only admins can create master tokens', 403);
    }

    const { label } = req.body;
    const rawToken = MasterToken.generateToken();

    const masterToken = await MasterToken.create({
      userId: req.userId,
      token: rawToken,
      label: label || '',
    });

    return successResponse(
      res,
      {
        token: masterToken,
        rawToken, // Return the raw token ONE TIME - it won't be shown again
      },
      'Master token created successfully. Save this token - it will not be shown again.',
      201
    );
  } catch (error) {
    next(error);
  }
};

const listTokens = async (req, res, next) => {
  try {
    if (req.userRole !== 'admin') {
      return errorResponse(res, 'Only admins can view master tokens', 403);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const tokens = await MasterToken.find({ userId: req.userId })
      .select('-token') // Never expose raw tokens
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await MasterToken.countDocuments({ userId: req.userId });

    return paginatedResponse(res, tokens, page, limit, total, 'Master tokens retrieved');
  } catch (error) {
    next(error);
  }
};

const revokeToken = async (req, res, next) => {
  try {
    if (req.userRole !== 'admin') {
      return errorResponse(res, 'Only admins can revoke master tokens', 403);
    }

    const token = await MasterToken.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!token) {
      return errorResponse(res, 'Token not found', 404);
    }

    token.isActive = false;
    await token.save();

    return successResponse(res, { token }, 'Token revoked successfully');
  } catch (error) {
    next(error);
  }
};

const deleteToken = async (req, res, next) => {
  try {
    if (req.userRole !== 'admin') {
      return errorResponse(res, 'Only admins can delete master tokens', 403);
    }

    const token = await MasterToken.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!token) {
      return errorResponse(res, 'Token not found', 404);
    }

    return successResponse(res, null, 'Token deleted successfully');
  } catch (error) {
    next(error);
  }
};

// ───────── WordPress External API (uses master token) ─────────

const authenticateMasterToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'No master token provided', 401);
    }

    const rawToken = authHeader.split(' ')[1];

    // Find the token
    const masterToken = await MasterToken.findOne({ token: rawToken });
    if (!masterToken) {
      return errorResponse(res, 'Invalid master token', 401);
    }

    if (!masterToken.isActive) {
      return errorResponse(res, 'Master token has been revoked', 401);
    }

    // Find the admin user who owns this token
    const admin = await User.findById(masterToken.userId);
    if (!admin) {
      return errorResponse(res, 'Token owner not found', 401);
    }

    // Update last used timestamp (don't await - fire and forget)
    MasterToken.updateOne(
      { _id: masterToken._id },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => {});

    // Attach admin info to request
    req.adminUser = admin;
    req.adminId = admin._id;
    next();
  } catch (error) {
    next(error);
  }
};

// ───────── External API Endpoints for WordPress ─────────

const externalGetConversations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline')
        .sort({ 'lastMessage.timestamp': -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Conversation.countDocuments(filter),
    ]);

    return paginatedResponse(res, conversations, page, limit, total, 'Conversations retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const externalGetConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline');

    if (!conversation) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    return successResponse(res, { conversation }, 'Conversation retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const externalGetMessages = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return errorResponse(res, 'Conversation not found', 404);
    }

    const [messages, total] = await Promise.all([
      Message.find({ conversationId: req.params.conversationId })
        .populate('senderId', 'email role profile.firstName profile.lastName profile.avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversationId: req.params.conversationId }),
    ]);

    // Transform to match frontend expected format
    const transformedMessages = messages.map((msg) => {
      const sender = msg.senderId
        ? {
            _id: msg.senderId._id,
            id: msg.senderId._id,
            email: msg.senderId.email,
            role: msg.senderId.role,
            profile: msg.senderId.profile,
            name: msg.senderId.profile
              ? `${msg.senderId.profile.firstName || ''} ${msg.senderId.profile.lastName || ''}`.trim() ||
                msg.senderId.email
              : msg.senderId.email,
          }
        : null;
      return {
        ...msg.toObject(),
        sender,
        senderId: sender,
      };
    });

    return paginatedResponse(res, { messages: transformedMessages.reverse() }, page, limit, total, 'Messages retrieved');
  } catch (error) {
    next(error);
  }
};

const externalGetUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.online === 'true') filter['status.isOnline'] = true;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return paginatedResponse(res, users, page, limit, total, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const externalGetUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken');
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }
    return successResponse(res, { user }, 'User retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const externalHealthCheck = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Worknoon Chat External API is running',
    authenticated: true,
    admin: {
      id: req.adminUser._id,
      email: req.adminUser.email,
      name: `${req.adminUser.profile?.firstName || ''} ${req.adminUser.profile?.lastName || ''}`.trim(),
    },
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  createToken,
  listTokens,
  revokeToken,
  deleteToken,
  authenticateMasterToken,
  externalGetConversations,
  externalGetConversation,
  externalGetMessages,
  externalGetUsers,
  externalGetUser,
  externalHealthCheck,
};
