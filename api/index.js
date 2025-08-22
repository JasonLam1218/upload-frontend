// START OF FILE index.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
require('dotenv').config(); // Ensure dotenv is loaded to read .env file

console.log('DEBUG: process.env.BLOB_READ_WRITE_TOKEN value:', process.env.BLOB_READ_WRITE_TOKEN ? '*** TOKEN IS PRESENT ***' : '--- TOKEN IS MISSING ---');

const VercelBlobService = require('../config/vercel/blob-config');
const BackendClient = require('../lib/api/backend-client');
const FileValidator = require('../utils/validation/file-validator');
const jobQueue = require('../lib/job-queue');

// Import route modules - NOW THEY ARE FUNCTIONS
const downloadRoutes = require('./download');
const statusRoutes = require('./status');

const app = express();

// Enhanced environment validation with fallbacks for serverless
function validateEnvironment() {
    const required = ['BLOB_READ_WRITE_TOKEN', 'BACKEND_API_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']; // Added Supabase variables
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
    console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? 'Present' : 'Missing'); // Log for debugging
    console.log('  - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Present' : 'Missing'); // Log for debugging


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
        backendClient = null; // Correctly sets backendClient to null
    }
} catch (error) {
    console.error('❌ Service initialization error:', error.message);
    console.warn('⚠️ Service initialization warning:', error.message);
}

// NOW, import route modules as functions and pass the backendClient
const downloadRoutesInstance = downloadRoutes(backendClient);
const statusRoutesInstance = statusRoutes(backendClient);

// Enhanced middleware configuration for serverless
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? [
            'https://upload-frontend-phi.vercel.app',
            'https://www.upload-frontend-phi.vercel.app',
            /\.vercel\.app$/
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

// NEW: Endpoint to provide public frontend configurations (like Supabase credentials)
app.get('/api/config', (req, res) => {
    try {
        // Only expose non-sensitive public keys/URLs
        const config = {
            SUPABASE_URL: process.env.SUPABASE_URL || null,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || null,
            // Add any other public frontend-facing env vars here
        };
        console.log('Serving frontend config:', {
            supabaseUrlPresent: !!config.SUPABASE_URL,
            supabaseAnonKeyPresent: !!config.SUPABASE_ANON_KEY
        });
        res.json(config);
    } catch (error) {
        console.error('Error serving config:', error);
        res.status(500).json({ error: 'Failed to retrieve configuration' });
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
            supabase_url_configured: !!process.env.SUPABASE_URL, // Added for health check
            supabase_anon_key_configured: !!process.env.SUPABASE_ANON_KEY, // Added for health check
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
app.use('/api/download', downloadRoutesInstance);
app.use('/api/status', statusRoutesInstance);

// REMOVED: The /api/exams endpoint from the frontend server, as the client will now fetch directly from Supabase.
// This block is now commented out or removed from your api/index.js
/*
app.get('/api/exams', async (req, res) => {
    // ... (removed or commented out logic)
});
*/

// Enhanced multer configuration for serverless
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 5 // Allow up to 5 files (adjust this limit as needed)
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

app.post('/api/upload', upload.array('files'), async (req, res) => {
    console.log('=== UPLOAD REQUEST RECEIVED ===');

    try {
        const files = req.files;
        const topic = req.body.topic;

        if (!files || files.length === 0) {
            console.log('❌ No files uploaded');
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
            });
        }

        if (!topic?.trim()) {
            console.log('❌ No topic provided');
            return res.status(400).json({
                success: false,
                error: 'Topic is required'
            });
        }

        console.log(`📤 Processing upload for ${files.length} files with topic: ${topic.trim()}`);

        const jobId = jobQueue.createJob('batch_upload_and_process', {
            files: files.map(f => ({ originalName: f.originalname, size: f.size, mimetype: f.mimetype })),
            topic: topic.trim()
        });

        console.log(`🆔 Created job ID: ${jobId}`);

        if (!blobService) {
            const errorMsg = 'Blob service not configured - BLOB_READ_WRITE_TOKEN missing or invalid';
            console.error(`❌ ${errorMsg}`);
            jobQueue.updateJob(jobId, { status: 'failed', message: errorMsg, progress: 0, error: errorMsg });
            return res.status(500).json({ success: false, error: errorMsg, jobId: jobId });
        }

        jobQueue.updateJob(jobId, {
            status: 'uploading',
            message: `Uploading ${files.length} file(s) to Vercel Blob Storage...`,
            progress: 10
        });

        const blobUrls = [];
        const uploadedFileDetails = [];

        for (const file of files) {
            console.log(`📤 Starting Vercel Blob upload for: ${file.originalname} (${file.size} bytes)`);
            try {
                const filename = `${Date.now()}-${FileValidator.sanitizeFilename(file.originalname)}`;
                console.log(`📝 Generated filename: ${filename}`);
                const blobResult = await blobService.uploadFile(file.buffer, filename);

                if (!blobResult.success || !blobResult.url) {
                    throw new Error('Blob upload returned invalid result');
                }

                if (!blobResult.url.includes('blob.vercel-storage.com')) {
                    console.warn('⚠️ Unexpected blob URL format:', blobResult.url);
                }

                console.log(`✅ Vercel Blob upload successful for ${file.originalname}:`, {
                    url: blobResult.url,
                    pathname: blobResult.pathname,
                    size: blobResult.size
                });

                blobUrls.push({
                    url: blobResult.url,
                    original_filename: file.originalname, // Add original filename
                    // You can add a 'category' here if you want to explicitly pass it from the frontend
                    // e.g., category: 'uploaded_document', or infer based on file name patterns.
                    // For simplicity, we'll let the Python backend determine content_type based on filename.
                });
                uploadedFileDetails.push({
                    originalName: file.originalname,
                    blobUrl: blobResult.url,
                    blobFilename: blobResult.filename,
                    size: file.size,
                    uploadTimestamp: new Date().toISOString()
                });

            } catch (uploadError) {
                console.error('❌ Vercel Blob upload failed for one or more files:', {
                    error: uploadError.message,
                    filename: file.originalname,
                    size: file.size
                });
                const errorMsg = `Upload failed for ${file.originalname}: ${uploadError.message}`;
                jobQueue.updateJob(jobId, { status: 'failed', message: errorMsg, progress: 0, error: errorMsg });
                return res.status(500).json({ success: false, error: `One or more files failed to upload: ${uploadError.message}`, jobId: jobId });
            }
        }

        jobQueue.updateJob(jobId, {
            status: 'uploaded',
            message: `All ${files.length} files uploaded successfully to Vercel Blob Storage!`,
            progress: 50,
            data: { ...jobQueue.getJob(jobId).data, uploadedFiles: uploadedFileDetails }
        });

        console.log(`🎯 Attempting backend processing integration for ${blobUrls.length} files...`);

        let processingResult = { job_id: `fallback_${jobId}` };
        if (backendClient) {
            try {
                jobQueue.updateJob(jobId, {
                    status: 'processing',
                    message: 'Triggering backend processing for files...',
                    progress: 60
                });

                processingResult = await backendClient.triggerProcessing(
                    blobUrls,
                    topic.trim()
                );

                // failed here 21/8/2025
                console.log('✅ Backend processing triggered:', processingResult);
            } catch (backendError) {
                console.warn('⚠️ Backend processing failed, continuing without backend:', backendError.message);
                jobQueue.updateJob(jobId, {
                    status: 'completed_with_warning',
                    message: 'Backend processing skipped/failed, files uploaded but not fully processed.',
                    progress: 90,
                    error: `Backend processing failed: ${backendError.message}`
                });

                return res.status(202).json({
                    success: true,
                    jobId: jobId,
                    backendJobId: processingResult.job_id,
                    blobUrls: blobUrls,
                    message: 'Files uploaded, but backend processing encountered an issue.',
                    warning: `Backend processing failed: ${backendError.message}`
                });
            }
        } else {
            console.log('ℹ️ Backend client not configured, skipping backend processing');
            jobQueue.updateJob(jobId, {
                status: 'completed',
                message: 'Files uploaded to Vercel Blob Storage. Backend processing skipped (not configured).',
                progress: 100,
                result: {
                    files: uploadedFileDetails.map((f, i) => ({
                        id: `original_${i+1}`,
                        name: `Original: ${f.originalName}`,
                        type: 'original',
                        blobUrl: f.blobUrl
                    })),
                    originalFilenames: uploadedFileDetails.map(f => f.originalName)
                }
            });

            const response = {
                success: true,
                jobId: jobId,
                backendJobId: null,
                blobUrls: blobUrls,
                uploadDetails: uploadedFileDetails,
                message: 'Files uploaded to Vercel Blob Storage. Backend processing skipped (not configured).'
            };
            console.log('✅ Upload successful, sending response (backend skipped):', { jobId: response.jobId });
            return res.json(response);
        }

        jobQueue.updateJob(jobId, {
            status: 'processing',
            message: 'Processing documents...',
            progress: 70,
            data: { ...jobQueue.getJob(jobId).data, backendJobId: processingResult.job_id }
        });

        setTimeout(() => {
            jobQueue.updateJob(jobId, {
                status: 'completed',
                message: 'Processing completed successfully!',
                progress: 100,
                result: {
                    files: [
                        { id: 'questions', name: 'Question Paper', type: 'questions', examId: 'latest' },
                        { id: 'answers', name: 'Model Answers', type: 'answers', examId: 'latest' },
                        { id: 'marking', name: 'Marking Scheme', type: 'marking', examId: 'latest' }
                    ],
                    blobUrls: blobUrls,
                    originalFilenames: files.map(f => f.originalname)
                }
            });
            console.log(`✅ Job ${jobId} completed successfully`);
        }, 3000);

        const response = {
            success: true,
            jobId: jobId,
            backendJobId: processingResult.job_id,
            blobUrls: blobUrls,
            uploadDetails: uploadedFileDetails,
            message: 'Files uploaded to Vercel Blob Storage and processing started'
        };

        console.log('✅ Upload successful, sending response:', { jobId: response.jobId, blobUrls: response.blobUrls });
        res.json(response);

    } catch (error) {
        console.error('❌ Upload endpoint error:', { message: error.message, stack: error.stack, timestamp: new Date().toISOString() });
        let currentJobId = null;
        try { if (res.locals && res.locals.jobId) { currentJobId = res.locals.jobId; } } catch (e) { /* ignore */ }
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            jobId: currentJobId
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
            'GET /api/config - Frontend configuration (Supabase keys etc.)', // Added to endpoints list
            'POST /api/upload - Upload and process documents',
            'GET /api/status?jobId={id} - Check processing status',
            'GET /api/download?file={id} - Download processed files'
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
            error: 'File too large. Maximum size is 50MB per file.',
            maxSize: '50MB'
        });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            error: 'Too many files. Only ' + upload.limits.files + ' files allowed.',
            maxFiles: upload.limits.files
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
            'GET /api/config', // Added to 404 response
            'POST /api/upload',
            'GET /api/status',
            'GET /api/download'
        ],
        message: 'The requested endpoint does not exist. Please check the available endpoints above.'
    });
});

// **IMPORTANT: Export for serverless - DO NOT use app.listen()**
module.exports = app;