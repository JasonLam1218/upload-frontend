// upload-frontend/lib/api/backend-client.js

const axios = require('axios');

class BackendClient {
  constructor() {
    this.baseURL = process.env.BACKEND_API_URL || 'http://localhost:5001';
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
      // MODIFICATION START: Change endpoint and payload keys to match Python backend
      const response = await this.client.post('/generate-exam', { // Correct endpoint name
        pdf_blob_urls: blobUrls, // Key name matching Flask backend's request.json.get('pdf_blob_urls')
        topic: topic,             // Key name matching Flask backend's request.json.get('topic')
        requirements: requirements // Key name matching Flask backend's request.json.get('requirements_file')
      });
      // MODIFICATION END
      return response.data;
    } catch (error) {
      // Log the actual error response from the backend if available for better debugging
      const errorMessage = error.response?.data?.error || error.message;
      console.error(`❌ Backend processing request failed: ${errorMessage}`);
      throw new Error(`Backend processing failed: ${errorMessage}`);
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
      // This endpoint is for proxying downloads through the Python backend.
      // It should match the Flask endpoint: /api/download/<int:exam_id>
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
      // This endpoint is no longer directly used by the frontend for listing exams,
      // as the frontend now fetches from Supabase directly.
      // However, if your backend *does* have an /api/exams endpoint, this would call it.
      const response = await this.client.get('/api/exams');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list exams (backend): ${error.response?.data?.error || error.message}`);
    }
  }
}

module.exports = BackendClient;