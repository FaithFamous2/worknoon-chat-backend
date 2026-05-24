const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const path = require('path');
const fs = require('fs');

// Check if Cloudinary is properly configured
const isCloudinaryConfigured = () => {
  return env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET;
};

// Configure Cloudinary only if credentials are available
if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ Cloudinary configured successfully');
} else {
  console.warn('⚠️  Cloudinary not configured. File uploads will use local storage.');
  console.warn('   Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

// Local upload directory
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

// Image types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg', 'image/svg+xml'];

// Video types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
];

// Document types
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (increased for videos)

/**
 * Get file type category
 * @param {string} mimeType - MIME type
 * @returns {string} 'image', 'video', 'document', or 'unknown'
 */
const getFileTypeCategory = (mimeType) => {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  return 'unknown';
};

/**
 * Save file locally as fallback
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} originalName - Original file name
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Local file info
 */
const saveFileLocally = async (fileBuffer, originalName, mimeType) => {
  try {
    const timestamp = Date.now();
    const safeFilename = `${timestamp}-${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const destPath = path.join(LOCAL_UPLOAD_DIR, safeFilename);

    console.log('Saving file locally:', { destPath, size: fileBuffer.length, mimeType });

    // Ensure directory exists
    if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
      fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
      console.log('Created uploads directory:', LOCAL_UPLOAD_DIR);
    }

    // Write file to uploads directory
    fs.writeFileSync(destPath, fileBuffer);
    console.log('File saved successfully:', destPath);

    // Verify file was written
    const stats = fs.statSync(destPath);
    console.log('File stats:', { size: stats.size, exists: stats.isFile() });

    // Determine file type
    const fileType = getFileTypeCategory(mimeType);
    const isImage = fileType === 'image';
    const isVideo = fileType === 'video';

    return {
      url: `/uploads/${safeFilename}`,
      publicId: safeFilename,
      type: mimeType,
      name: originalName,
      size: fileBuffer.length,
      fileType, // 'image', 'video', 'document'
      isImage,
      isVideo,
      isDocument: fileType === 'document',
      thumbnailUrl: isImage ? `/uploads/${safeFilename}` : null,
      previewUrl: isVideo ? `/uploads/${safeFilename}` : null,
      isLocal: true,
    };
  } catch (error) {
    console.error('Local file save error:', error);
    throw error;
  }
};

/**
 * Get MIME type from filename
 * @param {string} filename - File name
 * @returns {string} MIME type
 */
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    // Videos
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    // Documents
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Upload file to Cloudinary with local fallback
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} originalName - Original file name
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Upload result
 */
const uploadFile = async (fileBuffer, originalName, mimeType) => {
  // Validate file type
  if (!ALLOWED_FILE_TYPES.includes(mimeType)) {
    throw new Error(`File type ${mimeType} is not supported. Allowed types: images, videos (mp4, webm, mov), documents`);
  }

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }

  // If Cloudinary is not configured, use local storage
  if (!isCloudinaryConfigured()) {
    console.log('Cloudinary not configured, using local storage');
    return saveFileLocally(fileBuffer, originalName, mimeType);
  }

  const fileType = getFileTypeCategory(mimeType);
  const isImage = fileType === 'image';
  const isVideo = fileType === 'video';
  const resourceType = isImage || isVideo ? 'auto' : 'raw';

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: resourceType,
      folder: isImage ? 'chat_images' : isVideo ? 'chat_videos' : 'chat_documents',
      public_id: `${Date.now()}_${originalName.replace(/\.[^/.]+$/, '')}`,
      overwrite: false,
    };

    // Add image optimizations
    if (isImage) {
      uploadOptions.quality = 'auto';
      uploadOptions.fetch_format = 'auto';
    }

    // Add video optimizations
    if (isVideo) {
      uploadOptions.eager = [
        { width: 640, crop: 'scale', format: 'mp4' }, // Thumbnail/preview version
      ];
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error.message);
          console.error('Error details:', error);

          // If Cloudinary fails, fallback to local storage
          const isNetworkError = error.code === 'ENOTFOUND' ||
                                error.code === 'ECONNREFUSED' ||
                                error.http_code >= 500 ||
                                error.message?.includes('ENOTFOUND') ||
                                error.message?.includes('Invalid Signature');

          if (isNetworkError) {
            console.log('Cloudinary upload failed, falling back to local storage');
            saveFileLocally(fileBuffer, originalName, mimeType)
              .then(resolve)
              .catch(reject);
          } else {
            reject(error);
          }
        } else {
          const isImage = fileType === 'image';
          const isVideo = fileType === 'video';

          // Generate thumbnail URL for images
          let thumbnailUrl = null;
          if (isImage) {
            thumbnailUrl = cloudinary.url(result.public_id, {
              width: 300,
              crop: 'scale',
              quality: 'auto',
              fetch_format: 'auto',
            });
          }

          // Generate preview URL for videos
          let previewUrl = null;
          if (isVideo) {
            // Video thumbnail (first frame)
            thumbnailUrl = cloudinary.url(result.public_id, {
              resource_type: 'video',
              width: 300,
              crop: 'scale',
              format: 'jpg',
            });
            // Full video URL
            previewUrl = result.secure_url;
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            type: mimeType,
            name: originalName,
            size: fileBuffer.length,
            fileType, // 'image', 'video', 'document'
            isImage,
            isVideo,
            isDocument: fileType === 'document',
            thumbnailUrl,
            previewUrl,
            isLocal: false,
            // Video-specific
            duration: result.duration, // Video duration in seconds
            format: result.format, // File format
          });
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
};

/**
 * Upload multiple files to Cloudinary
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of files
 * @returns {Promise<Array>} Array of upload results
 */
const uploadMultipleFiles = async (files) => {
  const uploadPromises = files.map(file =>
    uploadFile(file.buffer, file.originalname, file.mimetype)
  );

  return Promise.all(uploadPromises);
};

/**
 * Delete file from Cloudinary or local storage
 * @param {string} publicId - Cloudinary public ID or local filename
 * @param {boolean} isLocal - Whether the file is stored locally
 * @param {string} resourceType - Resource type (image, video, or raw)
 * @returns {Promise<Object>} Deletion result
 */
const deleteFile = async (publicId, isLocal = false, resourceType = 'image') => {
  if (isLocal) {
    try {
      const filePath = path.join(LOCAL_UPLOAD_DIR, publicId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { result: 'deleted' };
    } catch (error) {
      console.error('Local file delete error:', error);
      throw error;
    }
  }

  if (!isCloudinaryConfigured()) {
    return { result: 'cloudinary not configured' };
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

/**
 * Generate signed upload preset for client-side uploads
 * @returns {Object} Upload configuration
 */
const getUploadConfig = () => {
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    uploadPreset: env.CLOUDINARY_UPLOAD_PRESET,
    apiKey: env.CLOUDINARY_API_KEY,
    allowedFileTypes: ALLOWED_FILE_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    isConfigured: isCloudinaryConfigured(),
  };
};

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  getUploadConfig,
  saveFileLocally,
  isCloudinaryConfigured,
  getFileTypeCategory,
  getMimeType,
  ALLOWED_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_FILE_SIZE,
};
