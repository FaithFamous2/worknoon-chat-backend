const express = require('express');
const router = express.Router();
const { uploadMiddleware, uploadFile } = require('../controllers/upload.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/', authenticate, (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return next(err);
    }
    uploadFile(req, res, next);
  });
});

module.exports = router;
