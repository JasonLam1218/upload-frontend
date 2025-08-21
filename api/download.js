// --- START OF FILE download.js ---

const express = require('express');
const router = express.Router();

// Change module.exports to a function that takes backendClient
module.exports = (backendClient) => { // Accept backendClient as an argument
  // This backendClient will now be the one passed from index.js, which is correctly null if BACKEND_API_URL is missing.

  // Download endpoint - Properly integrated with backend
  router.get('/', async (req, res) => {
    try {
      const { examId, type, file } = req.query;
      
      // Handle both new format (examId + type) and legacy format (file)
      if (examId && type) {
        console.log(`📥 Download request: examId=${examId}, type=${type}`);
        
        // Ensure backendClient is available before trying to use it
        if (!backendClient) {
            console.error('❌ Backend client not available for download request.');
            return res.status(503).json({ error: 'Download service temporarily unavailable: Backend not configured' });
        }
        
        const response = await backendClient.downloadFile(examId, type);
        
        // Set headers from backend response
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        res.setHeader('Content-Disposition', 
          response.headers['content-disposition'] || `attachment; filename=exam_${type}.pdf`);
        
        // Pipe the stream
        response.data.pipe(res);
        
      } else if (file) {
        // Legacy format: file ID mapping
        console.log(`📥 Legacy download request: file=${file}`);
        
        const fileMapping = {
          'questions': { examId: 'latest', type: 'questions' },
          'answers': { examId: 'latest', type: 'answers' },
          'marking': { examId: 'latest', type: 'marking' }
        };
        
        const mapped = fileMapping[file];
        if (!mapped) {
          return res.status(404).json({ error: 'File not found' });
        }
        
        // Ensure backendClient is available for legacy format too
        if (!backendClient) {
            console.error('❌ Backend client not available for legacy download request.');
            return res.status(503).json({ error: 'Download service temporarily unavailable: Backend not configured' });
        }

        const response = await backendClient.downloadFile(mapped.examId, mapped.type);
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        res.setHeader('Content-Disposition', 
          response.headers['content-disposition'] || `attachment; filename=${file}_paper.pdf`);
        
        response.data.pipe(res);
        
      } else {
        return res.status(400).json({ 
          error: 'Either (examId and type) or file parameter is required',
          examples: {
            new_format: '/api/download?examId=123&type=questions',
            legacy_format: '/api/download?file=questions'
          }
        });
      }

    } catch (error) {
      console.error('❌ Download error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'File not found' });
      } else if (error.message.includes('Backend processing failed') || error.message.includes('Download failed')) {
        res.status(503).json({ error: 'Download service temporarily unavailable' });
      } else {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });

  return router; // RETURN THE CONFIGURED ROUTER
};
// --- END OF FILE download.js ---