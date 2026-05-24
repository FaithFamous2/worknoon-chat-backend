const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, notificationController.getNotifications);
router.get('/unread-count', authenticate, notificationController.getUnreadCount);
router.put('/read-all', authenticate, notificationController.markAllAsRead);
router.put('/:notificationId/read', authenticate, notificationController.markAsRead);
router.delete('/:notificationId', authenticate, notificationController.deleteNotification);
router.delete(
  '/conversation/:conversationId',
  authenticate,
  notificationController.clearConversationNotifications
);

module.exports = router;
