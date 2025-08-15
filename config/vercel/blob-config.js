const { put, del, list } = require('@vercel/blob');

class VercelBlobService {
  constructor() {
    this.token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!this.token) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required');
    }
  }

  async uploadFile(file, filename) {
    try {
      const { url } = await put(filename, file, {
        access: 'public',
        token: this.token,
      });
      return { success: true, url, filename };
    } catch (error) {
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
