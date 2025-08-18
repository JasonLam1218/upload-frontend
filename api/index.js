// START OF FILE index.js

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

// Import route modules - NOW THEY ARE FUNCTIONS
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
        backendClient = null; // Correctly sets backendClient to null
    }
} catch (error) {
    console.error('❌ Service initialization error:', error.message);
    console.warn('⚠️ Service initialization warning:', error.message);
}

// NOW, import route modules as functions and pass the backendClient
const downloadRoutesInstance = downloadRoutes(backendClient); // Renamed to avoid conflict with `downloadRoutes` variable
const statusRoutesInstance = statusRoutes(backendClient);     // Renamed to avoid conflict with `statusRoutes` variable

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
app.use('/api/download', downloadRoutesInstance); // Use the instance
app.use('/api/status', statusRoutesInstance);     // Use the instance

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

// **COMPLETELY REWRITTEN: Upload endpoint with proper error handling and no silent fallbacks**
// Changed to upload.array('files') to handle multiple files
app.post('/api/upload', upload.array('files'), async (req, res) => { // CHANGED FROM upload.single('file')
    console.log('=== UPLOAD REQUEST RECEIVED ===');

    try {
        const files = req.files; // Now this is an array of files
        const topic = req.body.topic;

        // Validate file presence (check if array is empty)
        if (!files || files.length === 0) {
            console.log('❌ No files uploaded');
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
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

        console.log(`📤 Processing upload for ${files.length} files with topic: ${topic.trim()}`);

        // Create job for tracking the batch upload
        const jobId = jobQueue.createJob('batch_upload_and_process', { // Changed type for clarity
            files: files.map(f => ({ originalName: f.originalname, size: f.size, mimetype: f.mimetype })),
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

        // Update job status - uploading
        jobQueue.updateJob(jobId, {
            status: 'uploading',
            message: `Uploading ${files.length} file(s) to Vercel Blob Storage...`,
            progress: 10
        });

        const blobUrls = [];
        const uploadedFileDetails = [];

        // Loop through each file, upload to Vercel Blob, and collect URLs
        for (const file of files) {
            console.log(`📤 Starting Vercel Blob upload for: ${file.originalname} (${file.size} bytes)`);
            try {
                // Generate unique filename
                const filename = `${Date.now()}-${FileValidator.sanitizeFilename(file.originalname)}`;
                console.log(`📝 Generated filename: ${filename}`);

                // **ACTUAL UPLOAD TO VERCEL BLOB STORAGE**
                const blobResult = await blobService.uploadFile(file.buffer, filename);

                // Verify upload result
                if (!blobResult.success || !blobResult.url) {
                    throw new Error('Blob upload returned invalid result');
                }

                if (!blobResult.url.includes('blob.vercel-storage.com')) {
                    console.warn('⚠️ Unexpected blob URL format:', blobResult.url);
                }

                console.log(`✅ Vercel Blob upload successful for ${file.originalname}:`, {
                    url: blobResult.url,
                    pathname: blobResult.pathname, // Use pathname for more consistent logging
                    size: blobResult.size
                });

                blobUrls.push(blobResult.url);
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

                // Fail the entire job if any file fails to upload
                const errorMsg = `Upload failed for ${file.originalname}: ${uploadError.message}`;
                jobQueue.updateJob(jobId, {
                    status: 'failed',
                    message: errorMsg,
                    progress: 0,
                    error: errorMsg
                });

                return res.status(500).json({
                    success: false,
                    error: `One or more files failed to upload: ${uploadError.message}`,
                    jobId: jobId
                });
            }
        }

        // Update job status - all files uploaded successfully
        jobQueue.updateJob(jobId, {
            status: 'uploaded',
            message: `All ${files.length} files uploaded successfully to Vercel Blob Storage!`,
            progress: 50,
            data: {
                ...jobQueue.getJob(jobId).data, // Preserve existing data
                uploadedFiles: uploadedFileDetails
            }
        });

        console.log(`🎯 Attempting backend processing integration for ${blobUrls.length} files...`);

        // Try backend processing integration
        let processingResult = { job_id: `fallback_${jobId}` };
        if (backendClient) { // This backendClient is correctly null if BACKEND_API_URL is missing
            try {
                jobQueue.updateJob(jobId, {
                    status: 'processing',
                    message: 'Triggering backend processing for files...',
                    progress: 60
                });

                // Pass the array of blob URLs
                processingResult = await backendClient.triggerProcessing(
                    blobUrls, // Pass the array of URLs
                    topic.trim()
                );

                console.log('✅ Backend processing triggered:', processingResult);
            } catch (backendError) {
                console.warn('⚠️ Backend processing failed, continuing without backend:', backendError.message);
                // Even if backend fails, we still consider the blob upload a success
                // and report a 'completed' job for the frontend, but with a warning.
                jobQueue.updateJob(jobId, {
                    status: 'completed_with_warning', // New status for partial success
                    message: 'Backend processing skipped/failed, files uploaded but not fully processed.',
                    progress: 90, // Indicate it's not fully 100% processed as intended by backend
                    error: `Backend processing failed: ${backendError.message}`
                });

                return res.status(202).json({ // Return Accepted, not 500, since files are uploaded
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
            // If backend client is not configured, complete the job immediately
            jobQueue.updateJob(jobId, {
                status: 'completed', // Or 'completed_without_backend'
                message: 'Files uploaded to Vercel Blob Storage. Backend processing skipped (not configured).',
                progress: 100,
                result: {
                    // For multiple files, this is a placeholder. Actual backend would return relevant output.
                    files: uploadedFileDetails.map((f, i) => ({
                        id: `original_${i+1}`,
                        name: `Original: ${f.originalName}`,
                        type: 'original',
                        blobUrl: f.blobUrl // Link to the original uploaded blob
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

        // Update job with backend job ID
        jobQueue.updateJob(jobId, {
            status: 'processing',
            message: 'Processing documents...',
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
                    // This 'files' array would typically come from the backend's processing result.
                    // If multiple exams are generated, this structure needs to reflect that.
                    // For now, assuming either a single consolidated output or mock data.
                    files: [
                        { id: 'questions', name: 'Question Paper', type: 'questions', examId: 'latest' },
                        { id: 'answers', name: 'Model Answers', type: 'answers', examId: 'latest' },
                        { id: 'marking', name: 'Marking Scheme', type: 'marking', examId: 'latest' }
                    ],
                    blobUrls: blobUrls, // Changed to blobUrls for consistency
                    originalFilenames: files.map(f => f.originalname)
                }
            });
            console.log(`✅ Job ${jobId} completed successfully`);
        }, 3000);

        // Return successful response
        const response = {
            success: true,
            jobId: jobId,
            backendJobId: processingResult.job_id,
            blobUrls: blobUrls, // Changed to blobUrls
            uploadDetails: uploadedFileDetails,
            message: 'Files uploaded to Vercel Blob Storage and processing started'
        };

        console.log('✅ Upload successful, sending response:', {
            jobId: response.jobId,
            blobUrls: response.blobUrls
        });

        res.json(response);

    } catch (error) {
        console.error('❌ Upload endpoint error:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Try to get jobId from current context if available to update it
        let currentJobId = null;
        try {
            // This is a bit tricky to get the jobId in a general catch block
            // if the error occurred *before* jobId was assigned or updated.
            // For now, rely on previous updates.
            if (res.locals && res.locals.jobId) { // If you set locals earlier
                currentJobId = res.locals.jobId;
            }
        } catch (e) { /* ignore */ }

        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            jobId: currentJobId // Might be null if error before job creation
        });
    }
});

// List exams endpoint with error handling
app.get('/api/exams', async (req, res) => {
    try {
        console.log('📋 Listing exams...');

        if (!backendClient) { // Use the correctly initialized backendClient
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
            error: 'File too large. Maximum size is 50MB per file.', // Clarified message
            maxSize: '50MB'
        });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            error: 'Too many files. Only ' + upload.limits.files + ' files allowed.', // Dynamic message
            maxFiles: upload.limits.files // Provide the configured limit
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