// START OF FILE file-validator.js

class FileValidator {
  static validateFile(file) {
    const allowedTypes = [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip'
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB for Vercel Blob
    const minSize = 1024; // 1KB minimum

    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // Check file type
    if (!allowedTypes.includes(file.mimetype || file.type)) {
      return {
        valid: false,
        error: 'Only PDF and ZIP files are allowed'
      };
    }

    // Check file size
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size must be less than or equal to ${this.formatFileSize(maxSize)}` // Clarified message
      };
    }

    if (file.size < minSize) {
      return {
        valid: false,
        error: 'File appears to be too small or empty'
      };
    }

    // Check filename
    if (!this.isValidFilename(file.originalname || file.name)) {
      return {
        valid: false,
        error: 'Invalid filename. Use only letters, numbers, dots, hyphens, underscores, and spaces' // Clarified message
      };
    }

    return { valid: true };
  }

  static isValidFilename(filename) {
    // Allow letters, numbers, dots, hyphens, underscores, spaces
    const validPattern = /^[a-zA-Z0-9.\-_ ]+$/;
    return validPattern.test(filename) && filename.length > 0 && filename.length < 255;
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.\-_ ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);
  }
}

module.exports = FileValidator;