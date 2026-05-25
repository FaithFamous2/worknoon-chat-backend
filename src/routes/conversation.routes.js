const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const conversationController = require('../controllers/conversation.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.get('/', authenticate, conversationController.getConversations);

router.post(
  '/',
  authenticate,
  validate([
    body('participantIds')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one participant is required'),
    body('participantIds.*.userId')
      .optional()
      .isMongoId()
      .withMessage('Invalid participant ID'),
    body('participantIds.*.role')
      .optional()
      .isIn(['admin', 'agent', 'customer', 'designer', 'merchant'])
      .withMessage('Invalid participant role'),
    body('type')
      .isIn(['buyer-designer', 'buyer-merchant', 'buyer-agent'])
      .withMessage('Invalid conversation type'),
    body('autoAssign')
      .optional()
      .isBoolean()
      .withMessage('autoAssign must be a boolean'),
  ]),
  conversationController.createConversation
);

router.get('/:id', authenticate, conversationController.getConversation);

router.put(
  '/:id',
  authenticate,
  validate([
    body('status')
      .optional()
      .isIn(['active', 'closed', 'archived'])
      .withMessage('Invalid status'),
  ]),
  conversationController.updateConversation
);

router.delete('/:id', authenticate, conversationController.archiveConversation);

module.exports = router;
