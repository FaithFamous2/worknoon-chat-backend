const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');

router.get('/', authenticate, authorize('admin'), userController.getUsers);
router.get('/:id', authenticate, userController.getUserById);
router.put(
  '/profile',
  authenticate,
  validate([
    body('firstName').optional().trim().isLength({ max: 50 }),
    body('lastName').optional().trim().isLength({ max: 50 }),
    body('phone').optional().trim(),
    body('theme').optional().isIn(['light', 'dark']).withMessage('Theme must be light or dark'),
  ]),
  userController.updateProfile
);

module.exports = router;
