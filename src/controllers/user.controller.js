const User = require('../models/User');
const { successResponse, paginatedResponse } = require('../utils/response');
const { NotFoundError } = require('../utils/errors');

const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
    }
    if (req.query.search) {
      filter.$or = [
        { 'profile.firstName': { $regex: req.query.search, $options: 'i' } },
        { 'profile.lastName': { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    paginatedResponse(res, users, page, limit, total, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Get available users for chat by role (for customers to start conversations)
const getAvailableUsers = async (req, res, next) => {
  try {
    const { role } = req.query;

    // Only allow customers to access this endpoint
    if (req.user.role !== 'customer') {
      return successResponse(res, { users: [] }, 'Only customers can browse available users');
    }

    // Valid roles that customers can chat with
    const validRoles = ['agent', 'designer', 'merchant'];

    let filter = {
      status: { $ne: 'inactive' },
      role: { $in: validRoles }
    };

    // If specific role requested, filter by it
    if (role && validRoles.includes(role)) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select('_id email role profile.firstName profile.lastName profile.avatar profile.bio status.isOnline status.lastSeen')
      .sort({ 'status.isOnline': -1, 'profile.firstName': 1 });

    console.log(`[API] getAvailableUsers: Returning ${users.length} users with roles:`, users.map(u => ({ id: u._id, role: u.role, email: u.email })));

    successResponse(res, { users }, 'Available users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    successResponse(res, { user: user.toPublicJSON() }, 'User retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'phone', 'avatar'];
    const profileUpdates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        profileUpdates[`profile.${field}`] = req.body[field];
      }
    }

    if (req.body.theme) {
      profileUpdates['settings.theme'] = req.body.theme;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: profileUpdates },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    successResponse(res, { user: user.toPublicJSON() }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getAvailableUsers, getUserById, updateProfile };
