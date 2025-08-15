const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const VercelBlobService = require('../config/vercel/blob-config');
const BackendClient = require('../lib/api/backend-client');
const FileValidator = require('../utils/validation/file-validator');
const jobQueue = require('../lib/job-queue');

// Import route modules
const downloadRoutes = require('./download');
const statusRoutes = require('./status');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment validation
function validateEnvironment() {
  const required = ['BLOB_READ_WRITE_TOKEN', 'BACKEND_API_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    process.exit(1);
  }
  
  console.log('✅ All required environment variables are set');
}

validateEnvironment();

// Initialize services
const blobService = new VercelBlobService();
const backendClient = new BackendClient();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'static')));
app.use(express.static('public'));

// Use modular routes
app.use('/api/download', downloadRoutes);
app.use('/api/status', statusRoutes);

// Memory storage for multer (we'll upload to Vercel Blob)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const validation = FileValidator.validateFile(file);
    cb(validation.valid ? null : new Error(validation.error), validation.valid);
  }
});

// Upload endpoint - Enhanced with detailed verification
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const topic = req.body.topic;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    if (!topic?.trim()) {
      return res.status(400).json({ success: false, error: 'Topic is required' });
    }

    // Create job for tracking
    const jobId = jobQueue.createJob('upload_and_process', {
      originalName: file.originalname,
      size: file.size,
      topic: topic.trim()
    });

    console.log(`📤 Starting upload: ${file.originalname} (${file.size} bytes)`);

    // Upload to Vercel Blob Storage
    jobQueue.updateJob(jobId, {
      status: 'uploading',
      message: 'Uploading to Vercel Blob Storage...',
      progress: 10
    });

    const filename = `${Date.now()}-${FileValidator.sanitizeFilename(file.originalname)}`;
    const blobResult = await blobService.uploadFile(file.buffer, filename);

    // Verify upload success
    if (!blobResult.success || !blobResult.url) {
      throw new Error('Vercel Blob upload verification failed');
    }

    console.log(`✅ Vercel Blob upload successful: ${blobResult.url}`);

    // Update job status
    jobQueue.updateJob(jobId, {
      status: 'blob_uploaded',
      message: 'File uploaded to Vercel Blob Storage successfully!',
      progress: 30,
      data: { 
        ...jobQueue.getJob(jobId).data, 
        blobUrl: blobResult.url,
        blobFilename: blobResult.filename
      }
    });

    // Trigger backend processing
    jobQueue.updateJob(jobId, {
      status: 'processing',
      message: 'Triggering backend processing...',
      progress: 40
    });

    const processingResult = await backendClient.triggerProcessing(
      [blobResult.url],
      topic.trim()
    );

    // Update job with backend job ID
    jobQueue.updateJob(jobId, {
      status: 'processing',
      message: 'Processing with backend...',
      progress: 50,
      data: {
        ...jobQueue.getJob(jobId).data,
        backendJobId: processingResult.job_id
      }
    });

    res.json({
      success: true,
      jobId: jobId,
      backendJobId: processingResult.job_id,
      blobUrl: blobResult.url,
      uploadDetails: {
        filename: blobResult.filename,
        size: file.size,
        url: blobResult.url
      },
      message: 'File uploaded to Vercel Blob Storage and processing started'
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    // Update job with error
    if (req.body.jobId) {
      jobQueue.updateJob(req.body.jobId, {
        status: 'failed',
        error: error.message,
        progress: 0
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// List exams endpoint
app.get('/api/exams', async (req, res) => {
  try {
    const exams = await backendClient.listExams();
    res.json(exams);
  } catch (error) {
    console.error('List exams error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      blob_configured: !!process.env.BLOB_READ_WRITE_TOKEN,
      backend_url: process.env.BACKEND_API_URL
    },
    jobs: {
      total: jobQueue.listJobs(100).length,
      recent: jobQueue.listJobs(5)
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 50MB.'
    });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: 'Too many files. Only one file allowed.'
    });
  }
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Academic Upload Frontend running on http://localhost:${PORT}`);
  console.log(`📁 Static files served from /static/`);
  console.log(`☁️ Using Vercel Blob Storage for file uploads`);
  console.log(`🔗 Backend API: ${process.env.BACKEND_API_URL}`);
});

module.exports = app;
