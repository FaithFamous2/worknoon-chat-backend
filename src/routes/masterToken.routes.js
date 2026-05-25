const express = require('express');
const router = express.Router();
const controller = require('../controllers/masterToken.controller');
const { authenticate } = require('../middleware/auth.middleware');

// ── Admin Token Management Routes (require JWT auth) ──

// POST /api/master-tokens - Create a new master token (admin only)
router.post('/', authenticate, controller.createToken);

// GET /api/master-tokens - List all master tokens for the admin
router.get('/', authenticate, controller.listTokens);

// PUT /api/master-tokens/:id/revoke - Revoke a token
router.put('/:id/revoke', authenticate, controller.revokeToken);

// DELETE /api/master-tokens/:id - Delete a token
router.delete('/:id', authenticate, controller.deleteToken);

// ── External API Routes (use master token instead of JWT) ──

// GET /api/external/health - Health check with master token auth
router.get('/external/health', controller.authenticateMasterToken, controller.externalHealthCheck);

// GET /api/external/conversations - List all conversations
router.get('/external/conversations', controller.authenticateMasterToken, controller.externalGetConversations);

// GET /api/external/conversations/:id - Get single conversation
router.get('/external/conversations/:id', controller.authenticateMasterToken, controller.externalGetConversation);

// GET /api/external/conversations/:conversationId/messages - Get messages
router.get('/external/conversations/:conversationId/messages', controller.authenticateMasterToken, controller.externalGetMessages);

// GET /api/external/users - List all users
router.get('/external/users', controller.authenticateMasterToken, controller.externalGetUsers);

// GET /api/external/users/:id - Get single user
router.get('/external/users/:id', controller.authenticateMasterToken, controller.externalGetUser);

module.exports = router;
