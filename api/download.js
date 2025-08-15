const express = require('express');
const router = express.Router();
const BackendClient = require('../lib/api/backend-client');

const backendClient = new BackendClient();

// Download endpoint - Properly integrated with backend
router.get('/', async (req, res) => {
  try {
    const { examId, type, file } = req.query;
    
    // Handle both new format (examId + type) and legacy format (file)
    if (examId && type) {
      // New format: examId and type
      console.log(`📥 Download request: examId=${examId}, type=${type}`);
      
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
    } else if (error.message.includes('Backend processing failed')) {
      res.status(503).json({ error: 'Download service temporarily unavailable' });
    } else {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

module.exports = router;
