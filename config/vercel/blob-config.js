const { put, del, list } = require('@vercel/blob');

class VercelBlobService {
  constructor() {
    this.token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!this.token) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required');
    }
  }

  async uploadFile(file, filename) {
      console.log(`📤 Starting Vercel Blob upload:`, {
          filename,
          fileSize: file.length || file.byteLength || 'unknown',
          tokenPresent: !!this.token
      });

      try {
          const result = await put(filename, file, {
              access: 'public',
              token: this.token,
          });
          
          console.log('✅ Vercel Blob upload successful:', {
              url: result.url,
              pathname: result.pathname,
              size: result.size
          });
          
          return { success: true, url: result.url, filename };
      } catch (error) {
          console.error('❌ Vercel Blob upload failed:', {
              error: error.message,
              code: error.code,
              status: error.status,
              filename
          });
          throw new Error(`Blob upload failed: ${error.message}`);
      }
  }

  async deleteFile(url) {
    try {
      await del(url, { token: this.token });
      return { success: true };
    } catch (error) {
      throw new Error(`Blob deletion failed: ${error.message}`);
    }
  }

  async listFiles() {
    try {
      const { blobs } = await list({ token: this.token });
      return blobs;
    } catch (error) {
      throw new Error(`Blob listing failed: ${error.message}`);
    }
  }
}

module.exports = VercelBlobService;
