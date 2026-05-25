const express = require('express');
const router = express.Router();
const { guestLoginByEmail, checkEmailExists } = require('../controllers/guest.controller');

// Guest login by email only (passwordless)
router.post('/login-by-email', guestLoginByEmail);

// Check if email exists
router.post('/check-email', checkEmailExists);

module.exports = router;
