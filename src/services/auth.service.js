const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { BadRequestError, UnauthorizedError, ConflictError } = require('../utils/errors');

const register = async ({ email, password, role, firstName, lastName }) => {
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const user = await User.create({
    email: email.toLowerCase(),
    password,
    role: role || 'customer',
    profile: { firstName: firstName || '', lastName: lastName || '' },
  });

  const accessToken = generateAccessToken({ userId: user._id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return {
    user: user.toPublicJSON(),
    accessToken,
    refreshToken,
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const accessToken = generateAccessToken({ userId: user._id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return {
    user: user.toPublicJSON(),
    accessToken,
    refreshToken,
  };
};

const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.userId).select('+refreshToken');

  if (!user || user.refreshToken !== refreshToken) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const newAccessToken = generateAccessToken({ userId: user._id, role: user.role });
  const newRefreshToken = generateRefreshToken({ userId: user._id, role: user.role });

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

module.exports = { register, login, refreshTokens, logout };
