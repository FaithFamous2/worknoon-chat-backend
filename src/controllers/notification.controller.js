const Notification = require('../models/Notification');
const { successResponse, paginatedResponse } = require('../utils/response');
const { NotFoundError } = require('../utils/errors');

const getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const read = req.query.read;

    const filter = { userId: req.userId };
    if (read !== undefined) {
      filter.read = read === 'true';
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Notification.countDocuments(filter);

    paginatedResponse(res, notifications, page, limit, total);
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    successResponse(res, { notification }, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.userId, read: false },
      { read: true }
    );

    successResponse(res, null, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId: req.userId,
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    successResponse(res, null, 'Notification deleted');
  } catch (error) {
    next(error);
  }
};

const clearConversationNotifications = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const result = await Notification.deleteMany({
      userId: req.userId,
      'data.conversationId': conversationId,
    });

    successResponse(res, { deletedCount: result.deletedCount }, 'Conversation notifications cleared');
  } catch (error) {
    next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.userId,
      read: false,
    });

    successResponse(res, { count });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  clearConversationNotifications,
};
