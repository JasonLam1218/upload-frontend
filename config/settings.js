// Application configuration
module.exports = {
    // Server configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost'
    },
    
    // File upload configuration
    upload: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['application/pdf', 'application/zip', 'application/x-zip-compressed'],
        uploadDir: 'uploads',
        maxFiles: 1
    },
    
    // Processing configuration
    processing: {
        timeout: 300000, // 5 minutes
        maxConcurrentJobs: 5,
        cleanupInterval: 3600000 // 1 hour
    },
    
    // Frontend configuration
    frontend: {
        maxUploadDisplaySize: '10MB',
        supportedFormats: ['PDF', 'ZIP'],
        progressUpdateInterval: 2000 // 2 seconds
    },
    
    // Backend integration
    backend: {
        apiUrl: process.env.BACKEND_API_URL || 'http://localhost:8000',
        apiKey: process.env.BACKEND_API_KEY,
        timeout: 180000 // 3 minutes
    }
};
