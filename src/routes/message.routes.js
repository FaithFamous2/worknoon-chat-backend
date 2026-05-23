const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.get('/conversations/:conversationId', authenticate, messageController.getMessages);

router.post(
  '/',
  authenticate,
  validate([
    body('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('content').notEmpty().withMessage('Message content is required'),
  ]),
  messageController.sendMessage
);

router.put('/:messageId/read', authenticate, messageController.markAsRead);

module.exports = router;
