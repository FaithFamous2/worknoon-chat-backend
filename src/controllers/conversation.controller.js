const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { successResponse, paginatedResponse } = require('../utils/response');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const getConversations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {
      'participants.userId': req.userId,
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline')
        .sort({ 'lastMessage.timestamp': -1 })
        .skip(skip)
        .limit(limit),
      Conversation.countDocuments(filter),
    ]);

    paginatedResponse(res, conversations, page, limit, total, 'Conversations retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createConversation = async (req, res, next) => {
  try {
    const { participantIds, type, context } = req.body;

    const participants = [
      { userId: req.userId, role: req.user.role },
      ...participantIds.map((p) => ({
        userId: p.userId,
        role: p.role,
      })),
    ];

    // Check if conversation already exists with same participants
    const existingConversation = await Conversation.findOne({
      'participants.userId': { $all: participants.map((p) => p.userId) },
      type,
      status: { $ne: 'archived' },
    });

    if (existingConversation) {
      return successResponse(res, { conversation: existingConversation }, 'Conversation already exists');
    }

    const conversation = await Conversation.create({
      participants,
      type,
      context: context || {},
    });

    await conversation.populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar');

    successResponse(res, { conversation }, 'Conversation created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants.userId', 'email role profile.firstName profile.lastName profile.avatar status.isOnline');

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.userId._id.toString() === req.userId
    );
    if (!isParticipant && req.user.role !== 'admin') {
      throw new ForbiddenError('Not a participant of this conversation');
    }

    successResponse(res, { conversation }, 'Conversation retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updateConversation = async (req, res, next) => {
  try {
    const { status, context } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (context) updates.context = context;

    const conversation = await Conversation.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    successResponse(res, { conversation }, 'Conversation updated successfully');
  } catch (error) {
    next(error);
  }
};

const archiveConversation = async (req, res, next) => {
  try {
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true }
    );

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    successResponse(res, { conversation }, 'Conversation archived successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { getConversations, createConversation, getConversation, updateConversation, archiveConversation };
