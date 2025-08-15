const axios = require('axios');

class BackendClient {
  constructor() {
    this.baseURL = process.env.BACKEND_API_URL || 'http://localhost:5000';
    this.frontendURL = process.env.FRONTEND_URL || 'https://upload-frontend-phi.vercel.app';
    this.timeout = 300000; // 5 minutes
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  async triggerProcessing(blobUrls, topic, requirements = {}) {
    try {
      const response = await this.client.post('/api/process-files', {
        blob_urls: blobUrls,
        topic,
        requirements
      });
      return response.data;
    } catch (error) {
      throw new Error(`Backend processing failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async getStatus(jobId) {
    try {
      const response = await this.client.get(`/api/status/${jobId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Status check failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async downloadFile(examId, type) {
    try {
      const response = await this.client.get(`/api/download/${examId}?type=${type}`, {
        responseType: 'stream'
      });
      return response;
    } catch (error) {
      throw new Error(`Download failed: ${error.response?.data?.error || error.message}`);
    }
  }

  async listExams() {
    try {
      const response = await this.client.get('/api/exams');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list exams: ${error.response?.data?.error || error.message}`);
    }
  }
}

module.exports = BackendClient;
