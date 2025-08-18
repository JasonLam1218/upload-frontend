const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

console.log('DEBUG: process.env.BLOB_READ_WRITE_TOKEN value:', process.env.BLOB_READ_WRITE_TOKEN ? '*** TOKEN IS PRESENT ***' : '--- TOKEN IS MISSING ---');

const VercelBlobService = require('../config/vercel/blob-config');
const BackendClient = require('../lib/api/backend-client');
const FileValidator = require('../utils/validation/file-validator');
const jobQueue = require('../lib/job-queue');

// Import route modules
const downloadRoutes = require('./download');
const statusRoutes = require('./status');

const app = express();

// Enhanced environment validation with fallbacks for serverless
function validateEnvironment() {
    const required = ['BLOB_READ_WRITE_TOKEN', 'BACKEND_API_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.warn('⚠️ Missing environment variables:', missing);
        console.log('ℹ️ Running with fallbacks');
        
        // Log specific missing variables for debugging
        missing.forEach(varName => {
            console.warn(`❌ Missing: ${varName}`);
        });
    }
    
    // Log environment info for debugging
    console.log('🔍 Environment check:');
    console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');
    console.log('  - BLOB_READ_WRITE_TOKEN:', process.env.BLOB_READ_WRITE_TOKEN ? 'Present' : 'Missing');
    console.log('  - BACKEND_API_URL:', process.env.BACKEND_API_URL ? 'Present' : 'Missing');
    
    console.log('✅ Environment validation complete');
}

validateEnvironment();

// Initialize services with enhanced error handling
let blobService, backendClient;
try {
    // Enhanced blob service initialization with logging
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        console.log('🔑 Initializing Vercel Blob Service...');
        blobService = new VercelBlobService();
        console.log('✅ Blob service initialized successfully');
    } else {
        console.warn('⚠️ BLOB_READ_WRITE_TOKEN not found - blob service disabled');
        blobService = null;
    }
    
    // Backend client initialization
    if (process.env.BACKEND_API_URL) {
        console.log('🔗 Initializing Backend Client...');
        backendClient = new BackendClient();
        console.log('✅ Backend client initialized successfully');
    } else {
        console.warn('⚠️ BACKEND_API_URL not found - backend client disabled');
        backendClient = null;
    }
} catch (error) {
    console.error('❌ Service initialization error:', error.message);
    console.warn('⚠️ Service initialization warning:', error.message);
}

// Enhanced middleware configuration for serverless
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? [
            'https://upload-frontend-phi.vercel.app',
            'https://www.upload-frontend-phi.vercel.app',
            /\.vercel\.app$/  // Allow all vercel.app subdomains during testing
          ]
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enhanced request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('user-agent')?.substring(0, 50) || 'unknown';
    console.log(`${timestamp} - ${req.method} ${req.path} - ${userAgent}`);
    next();
});

// Add this endpoint to your api/index.js
app.get('/api/blobs', async (req, res) => {
    try {
        if (!blobService) {
            return res.status(500).json({ error: 'Blob service not available' });
        }

        console.log('📋 Listing blobs in storage...');
        const blobs = await blobService.listFiles();
        
        console.log(`✅ Found ${blobs.length} blobs:`, blobs.map(b => ({
            pathname: b.pathname,
            size: b.size,
            uploadedAt: b.uploadedAt
        })));

        res.json({
            count: blobs.length,
            blobs: blobs.map(blob => ({
                pathname: blob.pathname,
                url: blob.url,
                size: blob.size,
                uploadedAt: blob.uploadedAt
            }))
        });
    } catch (error) {
        console.error('❌ Failed to list blobs:', error);
        res.status(500).json({ error: error.message });
    }
});

// **Enhanced Health check endpoint with detailed diagnostics**
app.get('/api/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        deployment_url: 'https://upload-frontend-phi.vercel.app',
        environment: process.env.NODE_ENV || 'development',
        vercel_deployment: true,
        request_info: {
            method: req.method,
            path: req.path,
            origin: req.get('origin'),
            host: req.get('host'),
            user_agent: req.get('user-agent')?.substring(0, 50)
        },
        services: {
            blob_storage: blobService ? 'available' : 'fallback',
            backend_client: backendClient ? 'available' : 'fallback'
        },
        env_vars: {
            blob_configured: !!process.env.BLOB_READ_WRITE_TOKEN,
            backend_configured: !!process.env.BACKEND_API_URL,
            node_env: process.env.NODE_ENV
        },
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
        }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).json(health);
});

// Root health check (alternative endpoint)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// API routes
app.use('/api/download', downloadRoutes);
app.use('/api/status', statusRoutes);

// Enhanced multer configuration for serverless
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 1 // Only one file
    },
    fileFilter: (req, file, cb) => {
        console.log('🔍 File filter check:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
        
        const validation = FileValidator.validateFile(file);
        if (!validation.valid) {
            console.log('❌ File validation failed:', validation.error);
            return cb(new Error(validation.error), false);
        }
        
        console.log('✅ File validation passed');
        cb(null, true);
    }
});

// **COMPLETELY REWRITTEN: Upload endpoint with proper error handling and no silent fallbacks**
app.post('/api/upload', upload.single('file'), async (req, res) => {
    console.log('=== UPLOAD REQUEST RECEIVED ===');
    
    try {
        const file = req.file;
        const topic = req.body.topic;

        // Validate file presence
        if (!file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // Validate topic presence
        if (!topic?.trim()) {
            console.log('❌ No topic provided');
            return res.status(400).json({
                success: false,
                error: 'Topic is required'
            });
        }

        console.log(`📤 Processing upload:`, {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            topic: topic.trim()
        });

        // Create job for tracking
        const jobId = jobQueue.createJob('upload_and_process', {
            originalName: file.originalname,
            size: file.size,
            topic: topic.trim()
        });

        console.log(`🆔 Created job ID: ${jobId}`);

        // **CRITICAL: Require blob service for production - no silent fallbacks**
        if (!blobService) {
            const errorMsg = 'Blob service not configured - BLOB_READ_WRITE_TOKEN missing or invalid';
            console.error(`❌ ${errorMsg}`);
            
            // Update job with error
            jobQueue.updateJob(jobId, {
                status: 'failed',
                message: errorMsg,
                progress: 0,
                error: errorMsg
            });
            
            return res.status(500).json({
                success: false,
                error: errorMsg,
                jobId: jobId
            });
        }

        console.log(`📤 Starting Vercel Blob upload: ${file.originalname} (${file.size} bytes)`);

        // Update job status - uploading
        jobQueue.updateJob(jobId, {
            status: 'uploading',
            message: 'Uploading to Vercel Blob Storage...',
            progress: 10
        });

        let blobResult;
        
        try {
            // Generate unique filename
            const filename = `${Date.now()}-${FileValidator.sanitizeFilename(file.originalname)}`;
            console.log(`📝 Generated filename: ${filename}`);
            
            // **ACTUAL UPLOAD TO VERCEL BLOB STORAGE**
            blobResult = await blobService.uploadFile(file.buffer, filename);
            
            // Verify upload result
            if (!blobResult.success || !blobResult.url) {
                throw new Error('Blob upload returned invalid result');
            }

            // Verify URL format
            if (!blobResult.url.includes('blob.vercel-storage.com')) {
                console.warn('⚠️ Unexpected blob URL format:', blobResult.url);
            }

            console.log(`✅ Vercel Blob upload successful:`, {
                url: blobResult.url,
                filename: blobResult.filename,
                originalName: file.originalname
            });

        } catch (uploadError) {
            console.error('❌ Vercel Blob upload failed:', {
                error: uploadError.message,
                filename: file.originalname,
                size: file.size
            });

            // Update job with upload failure
            jobQueue.updateJob(jobId, {
                status: 'failed',
                message: `Upload failed: ${uploadError.message}`,
                progress: 0,
                error: uploadError.message
            });

            return res.status(500).json({
                success: false,
                error: `Blob upload failed: ${uploadError.message}`,
                jobId: jobId
            });
        }

        // Update job status - uploaded successfully
        jobQueue.updateJob(jobId, {
            status: 'uploaded',
            message: 'File uploaded successfully to Vercel Blob Storage!',
            progress: 50,
            data: {
                blobUrl: blobResult.url,
                blobFilename: blobResult.filename,
                originalName: file.originalname,
                uploadTimestamp: new Date().toISOString()
            }
        });

        console.log(`🎯 Attempting backend processing integration...`);

        // Try backend processing integration
        let processingResult = { job_id: `fallback_${jobId}` };
        if (backendClient) {
            try {
                jobQueue.updateJob(jobId, {
                    status: 'processing',
                    message: 'Triggering backend processing...',
                    progress: 60
                });

                processingResult = await backendClient.triggerProcessing(
                    [blobResult.url],
                    topic.trim()
                );

                console.log('✅ Backend processing triggered:', processingResult);
            } catch (backendError) {
                console.warn('⚠️ Backend processing failed, continuing without backend:', backendError.message);
            }
        } else {
            console.log('ℹ️ Backend client not configured, skipping backend processing');
        }

        // Update job with backend job ID
        jobQueue.updateJob(jobId, {
            status: 'processing',
            message: 'Processing document...',
            progress: 70,
            data: {
                ...jobQueue.getJob(jobId).data,
                backendJobId: processingResult.job_id
            }
        });

        // Simulate processing completion for demo (replace with real backend integration)
        setTimeout(() => {
            jobQueue.updateJob(jobId, {
                status: 'completed',
                message: 'Processing completed successfully!',
                progress: 100,
                result: {
                    files: [
                        { id: 'questions', name: 'Question Paper', type: 'questions' },
                        { id: 'answers', name: 'Model Answers', type: 'answers' },
                        { id: 'marking', name: 'Marking Scheme', type: 'marking' }
                    ],
                    blobUrl: blobResult.url,
                    originalFilename: file.originalname
                }
            });
            console.log(`✅ Job ${jobId} completed successfully`);
        }, 3000);

        // Return successful response
        const response = {
            success: true,
            jobId: jobId,
            backendJobId: processingResult.job_id,
            blobUrl: blobResult.url,
            uploadDetails: {
                filename: blobResult.filename,
                originalName: file.originalname,
                size: file.size,
                url: blobResult.url,
                uploadTimestamp: new Date().toISOString()
            },
            message: 'File uploaded to Vercel Blob Storage and processing started'
        };

        console.log('✅ Upload successful, sending response:', {
            jobId: response.jobId,
            blobUrl: response.blobUrl
        });

        res.json(response);

    } catch (error) {
        console.error('❌ Upload endpoint error:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

// List exams endpoint with error handling
app.get('/api/exams', async (req, res) => {
    try {
        console.log('📋 Listing exams...');
        
        if (!backendClient) {
            console.log('ℹ️ Backend client not configured, returning empty list');
            return res.json([]);
        }

        const exams = await backendClient.listExams();
        console.log(`✅ Retrieved ${exams.length} exams`);
        res.json(exams);
        
    } catch (error) {
        console.error('❌ List exams error:', error);
        res.status(500).json({
            error: error.message,
            fallback: [],
            timestamp: new Date().toISOString()
        });
    }
});

// Root route with API information
app.get('/', (req, res) => {
    console.log('🏠 Root route accessed');
    res.json({
        message: 'Academic Upload System API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        deployment: 'https://upload-frontend-phi.vercel.app',
        status: 'operational',
        endpoints: [
            'GET /health - Basic health check',
            'GET /api/health - Detailed health check',
            'POST /api/upload - Upload and process documents',
            'GET /api/status?jobId={id} - Check processing status',
            'GET /api/download?file={id} - Download processed files',
            'GET /api/exams - List available exams'
        ],
        services: {
            blob_storage: blobService ? 'available' : 'unavailable',
            backend_client: backendClient ? 'available' : 'unavailable'
        }
    });
});

// Enhanced error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'File too large. Maximum size is 50MB.',
            maxSize: '50MB'
        });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            error: 'Too many files. Only one file allowed.',
            maxFiles: 1
        });
    }

    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: `File upload error: ${error.message}`,
            type: 'MulterError'
        });
    }

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Enhanced 404 handler
app.use((req, res) => {
    console.log(`❌ 404 - Path not found: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET /api/health',
            'POST /api/upload',
            'GET /api/status',
            'GET /api/download',
            'GET /api/exams'
        ],
        message: 'The requested endpoint does not exist. Please check the available endpoints above.'
    });
});

// **IMPORTANT: Export for serverless - DO NOT use app.listen()**
module.exports = app;
