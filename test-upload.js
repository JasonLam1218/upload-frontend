// test-upload.js - Run in browser console
async function testUploadFlow() {
    console.log('🧪 Testing Upload Flow...');
    
    // 1. Health Check
    const health = await fetch('/api/health').then(r => r.json());
    console.log('Health:', health.services);
    
    // 2. Blob Service Check
    const blobs = await fetch('/api/blobs').then(r => r.json());
    console.log('Current blobs:', blobs.count);
    
    // 3. Create test file
    const testFile = new File(['test content'], 'test.pdf', {type: 'application/pdf'});
    
    // 4. Test upload
    const formData = new FormData();
    formData.append('file', testFile);
    formData.append('topic', 'Test Topic');
    
    const uploadResult = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    }).then(r => r.json());
    
    console.log('Upload result:', uploadResult);
    
    if (uploadResult.success) {
      // 5. Check status
      const status = await fetch(`/api/status?jobId=${uploadResult.jobId}`)
        .then(r => r.json());
      console.log('Job status:', status);
      
      // 6. Verify blob was created
      const newBlobs = await fetch('/api/blobs').then(r => r.json());
      console.log('New blob count:', newBlobs.count);
    }
  }
  
  // Run the test
  testUploadFlow();
  