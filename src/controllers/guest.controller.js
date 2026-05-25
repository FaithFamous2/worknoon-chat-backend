const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { successResponse } = require('../utils/response');
const { NotFoundError, UnauthorizedError } = require('../utils/errors');

/**
 * Guest login by email only (passwordless)
 * Used when guest returns on a different device and enters their email
 */
const guestLoginByEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new UnauthorizedError('Email is required');
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new NotFoundError('No account found with this email. Please register as a new guest.');
    }

    // Check if this is a guest user (role = customer and created via guest flow)
    // We allow this for any customer role user
    if (user.role !== 'customer') {
      throw new UnauthorizedError('This email is registered as a regular user. Please use the main login.');
    }

    // Generate new tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Update refresh token in database
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Return user data and tokens
    successResponse(res, {
      user: user.toPublicJSON(),
      accessToken,
      refreshToken,
    }, 'Session restored successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Check if email exists in system
 */
const checkEmailExists = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new UnauthorizedError('Email is required');
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    successResponse(res, {
      exists: !!user,
      isGuest: user ? user.role === 'customer' : false,
    }, 'Email check completed');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  guestLoginByEmail,
  checkEmailExists,
};
