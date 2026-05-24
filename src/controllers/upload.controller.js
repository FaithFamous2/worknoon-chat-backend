const multer = require('multer');
const { uploadFile, uploadMultipleFiles, getUploadConfig, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } = require('../services/cloudinary.service');
const { successResponse } = require('../utils/response');
const { BadRequestError } = require('../utils/errors');

// Configure multer for memory storage (files will be uploaded to Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`File type ${file.mimetype} is not supported. Allowed types: images, PDF, Word, Excel, PowerPoint, and text files.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Upload a single file to Cloudinary
 */
const uploadSingleFile = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequestError('No file uploaded');
    }

    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    successResponse(res, {
      file: result,
    }, 'File uploaded successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Upload multiple files to Cloudinary
 */
const uploadMultipleFilesController = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new BadRequestError('No files uploaded');
    }

    const results = await uploadMultipleFiles(req.files);

    successResponse(res, {
      files: results,
    }, `${results.length} file(s) uploaded successfully`, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Cloudinary upload configuration for client-side uploads
 */
const getCloudinaryConfig = async (req, res, next) => {
  try {
    const config = getUploadConfig();
    successResponse(res, { config }, 'Upload configuration retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Middleware for single file upload
const uploadSingleMiddleware = upload.single('file');

// Middleware for multiple files upload (up to 5 files)
const uploadMultipleMiddleware = upload.array('files', 5);

module.exports = {
  uploadSingleMiddleware,
  uploadMultipleMiddleware,
  uploadSingleFile,
  uploadMultipleFiles: uploadMultipleFilesController,
  getCloudinaryConfig,
};
