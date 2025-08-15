const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from static directory
app.use('/static', express.static(path.join(__dirname, '..', 'static')));
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1 // Only one file at a time
    },
    fileFilter: function (req, file, cb) {
        // Accept only PDF and ZIP files
        const allowedTypes = ['application/pdf', 'application/zip', 'application/x-zip-compressed'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and ZIP files are allowed'), false);
        }
    }
});

// In-memory job storage (use database in production)
const jobs = new Map();

// Job status enum
const JobStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const file = req.file;
        const topic = req.body.topic;
        
        if (!file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }
        
        if (!topic || topic.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Topic is required' 
            });
        }
        
        // Create job ID
        const jobId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Store job info
        jobs.set(jobId, {
            id: jobId,
            status: JobStatus.PENDING,
            file: {
                originalName: file.originalname,
                filename: file.filename,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
            },
            topic: topic.trim(),
            progress: 0,
            message: 'File uploaded, queued for processing',
            startTime: Date.now(),
            endTime: null,
            files: []
        });
        
        console.log(`📁 File uploaded: ${file.originalname} (Job ID: ${jobId})`);
        
        // Start processing (simulate async processing)
        setTimeout(() => {
            simulateProcessing(jobId);
        }, 1000);
        
        res.json({
            success: true,
            jobId: jobId,
            message: 'File uploaded successfully',
            fileInfo: {
                name: file.originalname,
                size: file.size,
                type: file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Upload failed' 
        });
    }
});

// Status endpoint
app.get('/api/status', (req, res) => {
    const jobId = req.query.jobId;
    
    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }
    
    const job = jobs.get(jobId);
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
        jobId: job.id,
        status: job.status,
        completed: job.status === JobStatus.COMPLETED,
        error: job.status === JobStatus.FAILED ? job.error : null,
        progress: job.progress,
        message: job.message,
        files: job.files,
        startTime: job.startTime,
        endTime: job.endTime,
        duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime
    });
});

// Download endpoint
app.get('/api/download', (req, res) => {
    const fileId = req.query.file;
    
    if (!fileId) {
        return res.status(400).json({ error: 'File ID is required' });
    }
    
    // In a real implementation, you would:
    // 1. Validate the file ID
    // 2. Check if the file exists
    // 3. Stream the file to the client
    
    // For now, return a placeholder response
    res.json({ 
        message: 'Download endpoint - implement file serving',
        fileId: fileId,
        downloadUrl: `/files/${fileId}` // This would be the actual file URL
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        jobs: {
            total: jobs.size,
            pending: Array.from(jobs.values()).filter(job => job.status === JobStatus.PENDING).length,
            processing: Array.from(jobs.values()).filter(job => job.status === JobStatus.PROCESSING).length,
            completed: Array.from(jobs.values()).filter(job => job.status === JobStatus.COMPLETED).length,
            failed: Array.from(jobs.values()).filter(job => job.status === JobStatus.FAILED).length
        }
    });
});

// Simulate processing (replace with actual backend integration)
function simulateProcessing(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;
    
    console.log(`🔄 Starting processing for job: ${jobId}`);
    job.status = JobStatus.PROCESSING;
    job.message = 'Processing document...';
    
    const steps = [
        { progress: 10, message: 'Extracting text from document...' },
        { progress: 25, message: 'Converting to markdown...' },
        { progress: 40, message: 'Generating text chunks...' },
        { progress: 60, message: 'Creating embeddings...' },
        { progress: 80, message: 'Generating examination papers...' },
        { progress: 95, message: 'Finalizing outputs...' },
        { progress: 100, message: 'Processing completed successfully!' }
    ];
    
    let stepIndex = 0;
    
    const processStep = () => {
        if (stepIndex >= steps.length) {
            // Complete the job
            job.status = JobStatus.COMPLETED;
            job.progress = 100;
            job.message = 'Processing completed successfully!';
            job.endTime = Date.now();
            job.files = [
                { id: 'questions', name: `${job.topic.replace(/\s+/g, '_')}_question_paper.pdf` },
                { id: 'answers', name: `${job.topic.replace(/\s+/g, '_')}_model_answers.pdf` },
                { id: 'marking', name: `${job.topic.replace(/\s+/g, '_')}_marking_scheme.pdf` }
            ];
            
            console.log(`✅ Job completed: ${jobId}`);
            return;
        }
        
        const step = steps[stepIndex];
        job.progress = step.progress;
        job.message = step.message;
        
        console.log(`⏳ Job ${jobId}: ${step.progress}% - ${step.message}`);
        
        stepIndex++;
        
        // Random delay between 1-3 seconds per step
        const delay = 1000 + Math.random() * 2000;
        setTimeout(processStep, delay);
    };
    
    // Start processing with initial delay
    setTimeout(processStep, 1000);
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Only one file allowed.'
            });
        }
    }
    
    console.error('Error:', error);
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
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
    console.log(`🚀 Academic Upload Server running on http://localhost:${PORT}`);
    console.log(`📁 Static files served from /static/`);
    console.log(`📤 File uploads stored in: ${uploadsDir}`);
    console.log(`💾 Maximum file size: 10MB`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully');
    process.exit(0);
});
