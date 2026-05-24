const express = require('express');
const router = express.Router();
const {
  uploadSingleMiddleware,
  uploadMultipleMiddleware,
  uploadSingleFile,
  uploadMultipleFiles,
  getCloudinaryConfig
} = require('../controllers/upload.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Upload single file
router.post('/single', authenticate, (req, res, next) => {
  uploadSingleMiddleware(req, res, (err) => {
    if (err) {
      return next(err);
    }
    uploadSingleFile(req, res, next);
  });
});

// Upload multiple files
router.post('/multiple', authenticate, (req, res, next) => {
  uploadMultipleMiddleware(req, res, (err) => {
    if (err) {
      return next(err);
    }
    uploadMultipleFiles(req, res, next);
  });
});

// Get Cloudinary configuration for client-side uploads
router.get('/config', authenticate, getCloudinaryConfig);

module.exports = router;
