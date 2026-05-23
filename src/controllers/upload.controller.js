const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { successResponse } = require('../utils/response');
const { BadRequestError } = require('../utils/errors');
const env = require('../config/env');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.UPLOAD_DEST);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('File type not supported'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequestError('No file uploaded');
    }

    let filePath = req.file.path;

    // Compress images using sharp
    if (req.file.mimetype.startsWith('image/') && req.file.mimetype !== 'image/gif') {
      const compressedPath = req.file.path.replace(/(\.[\w\d_-]+)$/i, '_compressed$1');
      await sharp(req.file.path)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(compressedPath);

      filePath = compressedPath;
    }

    successResponse(res, {
      file: {
        url: `/uploads/${path.basename(filePath)}`,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    }, 'File uploaded successfully', 201);
  } catch (error) {
    next(error);
  }
};

const uploadMiddleware = upload.single('file');

module.exports = { uploadMiddleware, uploadFile };
