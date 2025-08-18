// Upload functionality
const Upload = {
    currentJobId: null,
    uploadInProgress: false,
  
    // Initialize upload functionality
    init: function() {
      const uploadForm = document.getElementById('upload-form');
      if (uploadForm) {
        uploadForm.addEventListener('submit', this.handleSubmit.bind(this));
      }
      this.loadUploadHistory();
    },
  
    // Handle form submission
    handleSubmit: async function(e) {
      e.preventDefault();
      
      if (this.uploadInProgress) {
        Utils.showNotification('Upload already in progress', 'warning');
        return;
      }
  
      const fileInput = document.getElementById('file-input');
      const topicInput = document.getElementById('topic-input');
  
      if (!fileInput.files[0]) {
        Utils.showNotification('Please select a file', 'error');
        return;
      }
  
      if (!topicInput.value.trim()) {
        Utils.showNotification('Please enter a topic', 'error');
        return;
      }
  
      // Validate file
      const validation = Utils.validateFile(fileInput.files[0]);
      if (!validation.valid) {
        Utils.showNotification(validation.error, 'error');
        return;
      }
  
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('topic', topicInput.value.trim());
  
      await this.uploadFile(formData);
    },
  
    // Upload file to server
    uploadFile: async function(formData) {
      try {
        this.uploadInProgress = true;
        this.updateUploadButton(true);
        Utils.showElement('status-section');
        Utils.hideElement('results-section');
        
        Utils.updateContent('status-message', 'Uploading to Vercel Blob Storage...');
  
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
  
        const result = await response.json();
  
        if (result.success) {
          this.currentJobId = result.jobId;
          
          // Show detailed upload success
          Utils.updateContent('status-message', 
            `✅ File uploaded successfully to Vercel Blob Storage!\n📎 Blob URL: ${result.blobUrl}\n🟢 Processing started...`
          );
          
          Utils.showNotification('File uploaded to Vercel Blob Storage!', 'success');
          
          // Log upload details
          console.log('📤 Upload Success Details:', {
            jobId: result.jobId,
            backendJobId: result.backendJobId,
            blobUrl: result.blobUrl,
            uploadDetails: result.uploadDetails
          });
  
          // Save to upload history
          this.saveUploadHistory(result.jobId, formData.get('file').name, formData.get('topic'));
          
          // Start status checking
          this.checkStatus();
          
        } else {
          throw new Error(result.error || 'Upload failed');
        }
  
      } catch (error) {
        console.error('❌ Upload error:', error);
        Utils.updateContent('status-message', `❌ Upload failed: ${error.message}`);
        Utils.showNotification(`Upload failed: ${error.message}`, 'error');
      } finally {
        this.uploadInProgress = false;
        this.updateUploadButton(false);
      }
    },
  
    // Check processing status
    checkStatus: async function() {
      if (!this.currentJobId) return;
  
      try {
        const response = await fetch(`/api/status?jobId=${this.currentJobId}`);
        const status = await response.json();
  
        console.log('📊 Status update:', status);
  
        if (status.completed) {
          Utils.updateContent('status-message', 'Processing completed successfully!');
          document.getElementById('progress-fill').style.width = '100%';
          Utils.showNotification('Processing completed!', 'success');
          this.showResults(status.files, status.examId);
          this.currentJobId = null;
          
        } else if (status.error) {
          Utils.updateContent('status-message', 'Processing failed: ' + status.error);
          Utils.showNotification('Processing failed: ' + status.error, 'error');
          this.currentJobId = null;
          
        } else {
          // Update progress
          const progress = status.progress || 0;
          Utils.updateContent('status-message', status.message || 'Processing...');
          document.getElementById('progress-fill').style.width = progress + '%';
          
          // Continue checking
          setTimeout(() => this.checkStatus(), 2000);
        }
  
      } catch (error) {
        console.error('❌ Status check error:', error);
        Utils.updateContent('status-message', 'Status check failed: ' + error.message);
        Utils.showNotification('Status check failed', 'error');
        this.currentJobId = null;
      }
    },
  
    // Show results - Updated to handle both formats
    showResults: function(files, examId) {
      Utils.showElement('results-section');
      const downloadLinks = document.getElementById('download-links');
      downloadLinks.innerHTML = '';
      
      if (!files || files.length === 0) {
        downloadLinks.innerHTML = '<p>No files generated</p>';
        return;
      }
  
      console.log('📄 Showing results:', files);
  
      files.forEach(file => {
        const link = document.createElement('a');
        
        // Handle both new format (examId + type) and legacy format (file.id)
        if (file.examId && file.type) {
          link.href = `/api/download?examId=${file.examId}&type=${file.type}`;
          link.textContent = file.name || `${file.type.charAt(0).toUpperCase() + file.type.slice(1)} Paper`;
          link.download = `${file.type}_paper.pdf`;
        } else if (file.id) {
          // Legacy format
          link.href = `/api/download?file=${file.id}`;
          link.textContent = file.name || file.id;
          link.download = file.name || `${file.id}.pdf`;
        } else {
          // Fallback
          link.href = `/api/download?examId=${examId || 'latest'}&type=${file.type || 'questions'}`;
          link.textContent = file.name || 'Download File';
          link.download = file.name || 'exam_file.pdf';
        }
        
        link.className = 'download-link';
        link.target = '_blank';
        
        // Add click tracking
        link.addEventListener('click', () => {
          Utils.showNotification(`Downloading ${link.textContent}`, 'info');
        });
        
        downloadLinks.appendChild(link);
      });
    },
  
    // Update upload button state
    updateUploadButton: function(disabled) {
      const button = document.getElementById('upload-btn');
      if (button) {
        button.disabled = disabled;
        button.textContent = disabled ? 'Processing...' : 'Upload and Process';
        if (disabled) {
          button.classList.add('loading');
        } else {
          button.classList.remove('loading');
        }
      }
    },
  
    // Save upload history
    saveUploadHistory: function(jobId, fileName, topic) {
      const history = Utils.loadFromStorage('uploadHistory') || [];
      history.unshift({ 
        jobId, 
        fileName, 
        topic, 
        timestamp: new Date().toISOString() 
      });
      
      // Keep only last 10 uploads
      history.splice(10);
      Utils.saveToStorage('uploadHistory', history);
    },
  
    // Load upload history
    loadUploadHistory: function() {
      const history = Utils.loadFromStorage('uploadHistory') || [];
      console.log('📚 Upload history:', history);
    },
  
    // Reset form
    resetForm: function() {
      const form = document.getElementById('upload-form');
      if (form) {
        form.reset();
        Utils.hideElement('status-section');
        Utils.hideElement('results-section');
      }
      
      // Reset file input display
      const label = document.querySelector('label[for="file-input"]');
      if (label) {
        label.innerHTML = `
          <p>Click to select PDF or ZIP file</p>
          <p class="hint">Maximum file size: 50MB</p>
        `;
        label.classList.remove('file-selected', 'file-error');
      }
    },
  
    // Cancel current upload
    cancelUpload: function() {
      if (this.currentJobId) {
        this.currentJobId = null;
        this.uploadInProgress = false;
        this.updateUploadButton(false);
        Utils.updateContent('status-message', 'Upload cancelled');
        Utils.showNotification('Upload cancelled', 'warning');
      }
    }
  };
  
  // Export for module systems if available
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Upload;
  }
  