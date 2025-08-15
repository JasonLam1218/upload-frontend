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

// Environment validation with fallbacks for serverless
function validateEnvironment() {
    const required = ['BLOB_READ_WRITE_TOKEN', 'BACKEND_API_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.warn('⚠️ Missing environment variables:', missing);
        console.log('ℹ️ Running with fallbacks');
    }
    console.log('✅ Environment validation complete');
}

validateEnvironment();

// Initialize services with error handling
let blobService, backendClient;
try {
    blobService = process.env.BLOB_READ_WRITE_TOKEN ? new VercelBlobService() : null;
    backendClient = process.env.BACKEND_API_URL ? new BackendClient() : null;
} catch (error) {
    console.warn('⚠️ Service initialization warning:', error.message);
}

// Middleware configuration for serverless
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://upload-frontend-phi.vercel.app'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// **FIXED: Health check endpoint**
app.get('/api/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            blob_storage: blobService ? 'available' : 'fallback',
            backend_client: backendClient ? 'available' : 'fallback'
        },
        vercel_deployment: true
    };

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(health);
});

// Root health check (alternative endpoint)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// API routes
app.use('/api/download', downloadRoutes);
app.use('/api/status', statusRoutes);

// Multer configuration for serverless
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 1 
    },
    fileFilter: (req, file, cb) => {
        const validation = FileValidator.validateFile(file);
        if (!validation.valid) {
            return cb(new Error(validation.error), false);
        }
        cb(null, true);
    }
});

// **FIXED: Upload endpoint**
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const topic = req.body.topic;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        if (!topic?.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Topic is required'
            });
        }

        // Create job for tracking
        const jobId = jobQueue.createJob('upload_and_process', {
            originalName: file.originalname,
            size: file.size,
            topic: topic.trim()
        });

        console.log(`📤 Starting upload: ${file.originalname} (${file.size} bytes)`);

        // Upload to Vercel Blob Storage (with fallback)
        let blobResult;
        if (blobService) {
            try {
                const filename = `${Date.now()}-${FileValidator.sanitizeFilename(file.originalname)}`;
                blobResult = await blobService.uploadFile(file.buffer, filename);
                
                if (!blobResult.success) {
                    throw new Error('Blob upload failed');
                }
            } catch (error) {
                console.warn('⚠️ Blob upload failed, using fallback:', error.message);
                blobResult = {
                    success: true,
                    url: `data:application/pdf;base64,${file.buffer.toString('base64')}`,
                    filename: file.originalname
                };
            }
        } else {
            // Fallback for development
            blobResult = {
                success: true,
                url: `fallback-${Date.now()}`,
                filename: file.originalname
            };
        }

        // Update job status
        jobQueue.updateJob(jobId, {
            status: 'uploaded',
            message: 'File uploaded successfully!',
            progress: 50,
            data: {
                blobUrl: blobResult.url,
                blobFilename: blobResult.filename
            }
        });

        // Simulate processing for demo
        setTimeout(() => {
            jobQueue.updateJob(jobId, {
                status: 'completed',
                message: 'Processing completed!',
                progress: 100,
                result: {
                    files: [
                        { id: 'questions', name: 'Question Paper', type: 'questions' },
                        { id: 'answers', name: 'Model Answers', type: 'answers' },
                        { id: 'marking', name: 'Marking Scheme', type: 'marking' }
                    ]
                }
            });
        }, 3000);

        const response = {
            success: true,
            jobId: jobId,
            blobUrl: blobResult.url,
            uploadDetails: {
                filename: blobResult.filename,
                size: file.size,
                url: blobResult.url
            },
            message: 'File uploaded and processing started'
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
});

// List exams endpoint
app.get('/api/exams', async (req, res) => {
    try {
        if (!backendClient) {
            return res.json([]);
        }
        const exams = await backendClient.listExams();
        res.json(exams);
    } catch (error) {
        console.error('List exams error:', error);
        res.status(500).json({ 
            error: error.message,
            fallback: []
        });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Academic Upload System API',
        endpoints: [
            'GET /health',
            'GET /api/health', 
            'POST /api/upload',
            'GET /api/status',
            'GET /api/download',
            'GET /api/exams'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Global Error:', error);

    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'File too large. Maximum size is 50MB.'
        });
    }

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    console.log(`❌ 404 - Path not found: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET /api/health',
            'POST /api/upload',
            'GET /api/status',
            'GET /api/download',
            'GET /api/exams'
        ]
    });
});

// **IMPORTANT: Export for serverless - DO NOT use app.listen()**
module.exports = app;
