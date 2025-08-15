const express = require('express');
const router = express.Router();
const jobQueue = require('../lib/job-queue');
const BackendClient = require('../lib/api/backend-client');

const backendClient = new BackendClient();

// Status endpoint - Integrated with job queue and backend
router.get('/', async (req, res) => {
  try {
    const jobId = req.query.jobId;
    
    if (!jobId) {
      return res.status(400).json({ 
        error: 'Job ID is required',
        example: '/api/status?jobId=your_job_id'
      });
    }

    const job = jobQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log(`📊 Status check for job: ${jobId} (current status: ${job.status})`);

    // If we have a backend job ID, check backend status
    if (job.data?.backendJobId) {
      try {
        console.log(`🔍 Checking backend status for: ${job.data.backendJobId}`);
        const backendStatus = await backendClient.getStatus(job.data.backendJobId);
        
        // Update local job with backend status
        jobQueue.updateJob(jobId, {
          status: backendStatus.status,
          message: backendStatus.message || job.message,
          progress: backendStatus.progress || job.progress,
          result: backendStatus.result || job.result,
          error: backendStatus.error || job.error
        });

        const updatedJob = jobQueue.getJob(jobId);
        
        // Format files for frontend compatibility
        let files = updatedJob.result?.output_files || [];
        if (updatedJob.result?.exam_id) {
          // Convert backend format to frontend format
          files = [
            { 
              id: 'questions', 
              name: 'Question Paper', 
              examId: updatedJob.result.exam_id, 
              type: 'questions' 
            },
            { 
              id: 'answers', 
              name: 'Model Answers', 
              examId: updatedJob.result.exam_id, 
              type: 'answers' 
            },
            { 
              id: 'marking', 
              name: 'Marking Scheme', 
              examId: updatedJob.result.exam_id, 
              type: 'marking' 
            }
          ];
        }

        return res.json({
          jobId: updatedJob.id,
          status: updatedJob.status,
          completed: updatedJob.status === 'completed',
          error: updatedJob.error,
          progress: updatedJob.progress,
          message: updatedJob.message,
          examId: updatedJob.result?.exam_id,
          files: files,
          duration: Date.now() - updatedJob.createdAt,
          backendJobId: job.data.backendJobId
        });
        
      } catch (backendError) {
        console.error('❌ Backend status check failed:', backendError);
        // Fall back to local job status
        console.log('⚠️ Falling back to local job status');
      }
    }

    // Return local job status
    res.json({
      jobId: job.id,
      status: job.status,
      completed: job.status === 'completed',
      error: job.error,
      progress: job.progress,
      message: job.message,
      files: job.result?.files || [],
      duration: Date.now() - job.createdAt,
      source: 'local'
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
