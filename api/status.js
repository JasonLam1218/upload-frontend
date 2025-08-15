// Status API endpoint (if you want separate files)
const express = require('express');
const router = express.Router();

// This would be imported from a shared jobs store in a real app
let jobs = new Map();

router.get('/', (req, res) => {
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
        completed: job.status === 'completed',
        error: job.status === 'failed' ? job.error : null,
        progress: job.progress,
        message: job.message,
        files: job.files || [],
        duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime
    });
});

module.exports = router;
