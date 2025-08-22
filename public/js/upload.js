// START OF FILE upload.js

// Upload functionality
const Upload = {
  currentJobId: null,
  uploadInProgress: false,

  // Initialize upload functionality
  init: function() {
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
      console.log('✅ [DEBUG] uploadForm found. Attaching submit listener.');
      uploadForm.addEventListener('submit', this.handleSubmit.bind(this));
    } else {
      console.error('❌ [DEBUG] uploadForm (ID: "uploadForm") not found in the DOM. Submit listener NOT attached.');
    }
    this.loadUploadHistory();
  },

  // Handle form submission
  handleSubmit: async function(e) {
    console.log('🔗 [DEBUG] handleSubmit triggered!');
    e.preventDefault();
    console.log('🛑 [DEBUG] Default form submission prevented.');

    if (this.uploadInProgress) {
      Utils.showNotification('Upload already in progress', 'warning');
      return;
    }

    const fileInput = document.getElementById('file-input');
    const topicInput = document.getElementById('topic-input');

    const files = fileInput.files; // Get all selected files
    if (files.length === 0) {
      Utils.showNotification('Please select at least one file', 'error');
      return;
    }

    if (!topicInput.value.trim()) {
      Utils.showNotification('Please enter a topic', 'error');
      return;
    }

    // Validate all files
    let allFilesValid = true;
    for (let i = 0; i < files.length; i++) {
      const validation = Utils.validateFile(files[i]);
      if (!validation.valid) {
        Utils.showNotification(`File "${files[i].name}" invalid: ${validation.error}`, 'error');
        allFilesValid = false;
      }
    }

    if (!allFilesValid) {
      return; // Stop if any file is invalid
    }

    const formData = new FormData();
    // Append each file with the name 'files' (matching backend's multer config)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]); // CHANGED 'file' to 'files'
    }
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

      // Set initial progress bar state before the actual fetch call
      Utils.updateContent('status-message', 'Initiating upload...');
      document.getElementById('progress-fill').style.width = '0%';
      Utils.updateContent('progress-text', '0%'); // Initialize progress text to 0%

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.currentJobId = result.jobId;

        // Show detailed upload success
        const uploadedBlobUrls = result.blobUrls ? result.blobUrls.map(f => f.url).join(', ') : 'N/A'; // For multiple files
        Utils.updateContent('status-message',
          `✅ Files uploaded successfully to Vercel Blob Storage!\n📎 Blob URLs: ${uploadedBlobUrls}\n🟢 Processing started...`
        );

        Utils.showNotification('Files submitted for processing!', 'success'); // Changed message

        // Log upload details
        console.log('📤 Upload Success Details:', {
          jobId: result.jobId,
          backendJobId: result.backendJobId,
          blobUrls: result.blobUrls, // Changed to blobUrls
          uploadDetails: result.uploadDetails
        });

        // Save to upload history - collect all filenames
        const uploadedFileNames = Array.from(formData.getAll('files')).map(f => f.name); // Get names of all files
        this.saveUploadHistory(result.jobId, uploadedFileNames, formData.get('topic')); // Pass array of names

        // Start status checking
        this.checkStatus();

      } else {
        throw new Error(result.error || 'Upload failed');
      }

    } catch (error) {
      console.error('❌ Upload error:', error);
      Utils.updateContent('status-message', `❌ Upload failed: ${error.message}`);
      Utils.showNotification(`Upload failed: ${error.message}`, 'error');
      // On error, reset progress bar
      document.getElementById('progress-fill').style.width = '0%';
      Utils.updateContent('progress-text', 'Error'); // Update text on error
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
        Utils.updateContent('progress-text', '100%'); // Update progress text to 100%
        Utils.showNotification('Processing completed!', 'success');
        this.showResults(status.files, status.examId); // This might need adjustment if multiple examId's are returned
        this.currentJobId = null;
        
        // MODIFICATION START: Trigger loadExamHistory after successful completion
        // `loadExamHistory` is a global function from main.js
        if (typeof loadExamHistory === 'function') {
            await loadExamHistory(); // Reload the list of generated exams
            console.log('✅ Exam history reloaded after successful generation.');
        }
        // MODIFICATION END

      } else if (status.error) {
        Utils.updateContent('status-message', 'Processing failed: ' + status.error);
        Utils.showNotification('Processing failed: ' + status.error, 'error');
        document.getElementById('progress-fill').style.width = '0%'; // Reset on error
        Utils.updateContent('progress-text', 'Error'); // Update progress text on error
        this.currentJobId = null;

      } else {
        // Update progress
        const progress = status.progress || 0;
        Utils.updateContent('status-message', status.message || 'Processing...');
        document.getElementById('progress-fill').style.width = progress + '%';
        Utils.updateContent('progress-text', `${progress}%`); // Update progress text with current percentage

        // Continue checking
        setTimeout(() => this.checkStatus(), 2000);
      }

    } catch (error) {
      console.error('❌ Status check error:', error);
      Utils.updateContent('status-message', 'Status check failed: ' + error.message);
      Utils.showNotification('Status check failed', 'error');
      document.getElementById('progress-fill').style.width = '0%'; // Reset on error
      Utils.updateContent('progress-text', 'Error'); // Update progress text on status check error
      this.currentJobId = null;
    }
  },

  // Show results - Updated to handle both formats
  showResults: function(files, examId) {
    Utils.showElement('results-section');
    const downloadLinks = document.getElementById('download-links');
    downloadLinks.innerHTML = '';

    if (!files || files.length === 0) {
      downloadLinks.innerHTML = '<p>No files generated for download.</p>'; // Updated message
      return;
    }

    console.log('📄 Showing results:', files);

    files.forEach(file => {
      const link = document.createElement('a');

      // Handle both new format (examId + type) and legacy format (file.id)
      if (file.examId && file.type) {
        link.href = `/api/download?examId=${file.examId}&type=${file.type}`;
        link.textContent = file.name || `${file.type.charAt(0).toUpperCase() + file.type.slice(1)} Paper`;
        link.download = `${file.examId}_${file.type}.pdf`; // More specific download name
      } else if (file.id) {
        // Legacy format
        link.href = `/api/download?file=${file.id}`;
        link.textContent = file.name || file.id;
        link.download = file.name || `${file.id}.pdf`;
      } else if (file.blobUrl && file.name) { // Fallback for direct blob downloads if backend doesn't provide structured data
          link.href = file.blobUrl;
          link.textContent = `Download Original: ${file.name}`;
          link.download = file.name;
      }
      else {
        // Fallback if no specific format is matched
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
  saveUploadHistory: function(jobId, fileNames, topic) { // fileNames is now an array
    const history = Utils.loadFromStorage('uploadHistory') || [];
    history.unshift({
      jobId,
      fileNames, // Store as an array
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
    const form = document.getElementById('uploadForm'); // Changed to uploadForm
    if (form) {
      form.reset();
      Utils.hideElement('status-section');
      Utils.hideElement('results-section');
    }

    // Reset file input display (handled by main.js's resetFileInput)
    // Call main.js's resetFileInput to ensure consistency
    if (typeof resetFileInput === 'function') {
        resetFileInput();
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