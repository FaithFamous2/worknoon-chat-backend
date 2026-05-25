const authService = require('../services/auth.service');
const { successResponse } = require('../utils/response');

const register = async (req, res, next) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;
    const result = await authService.register({ email, password, role, firstName, lastName });
    return successResponse(res, result, 'Registration successful', 201);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    return successResponse(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    return successResponse(res, result, 'Tokens refreshed successfully');
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    return successResponse(res, { user: req.user.toPublicJSON() }, 'User retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.userId);
    return successResponse(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refresh, getMe, logout };
