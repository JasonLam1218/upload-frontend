// Main application initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Academic Upload System initialized');
    
    // Initialize upload functionality
    Upload.init();
    
    // Initialize file input handling
    initializeFileInput();
    
    // Initialize drag and drop
    initializeDragAndDrop();
    
    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();
    
    // Check for saved form data
    restoreFormData();
    
    // Check server health
    checkServerHealth();
    
    console.log('All systems ready!');
  });
  
  function initializeFileInput() {
    const fileInput = document.getElementById('file-input');
    if (!fileInput) return;
  
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const label = document.querySelector('label[for="file-input"]');
        const validation = Utils.validateFile(file);
        
        if (validation.valid) {
          label.innerHTML = `
            <p><strong>Selected:</strong> ${Utils.escapeHtml(file.name)}</p>
            <p>Size: ${Utils.formatFileSize(file.size)}</p>
            <p>✓ File is valid</p>
          `;
          label.classList.add('file-selected');
          label.classList.remove('file-error');
        } else {
          label.innerHTML = `
            <p><strong>Selected:</strong> ${Utils.escapeHtml(file.name)}</p>
            <p>✗ ${validation.error}</p>
          `;
          label.classList.add('file-error');
          label.classList.remove('file-selected');
          Utils.showNotification(validation.error, 'error');
        }
      } else {
        resetFileInput();
      }
    });
  }
  
  function initializeDragAndDrop() {
    const uploadArea = document.querySelector('.upload-area');
    if (!uploadArea) return;
  
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });
  
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadArea.addEventListener(eventName, highlight, false);
    });
  
    ['dragleave', 'drop'].forEach(eventName => {
      uploadArea.addEventListener(eventName, unhighlight, false);
    });
  
    // Handle dropped files
    uploadArea.addEventListener('drop', handleDrop, false);
  
    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  
    function highlight(e) {
      uploadArea.classList.add('dragover');
    }
  
    function unhighlight(e) {
      uploadArea.classList.remove('dragover');
    }
  
    function handleDrop(e) {
      const dt = e.dataTransfer;
      const files = dt.files;
  
      if (files.length > 0) {
        const fileInput = document.getElementById('file-input');
        fileInput.files = files;
        
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    }
  }
  
  function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl/Cmd + Enter to submit form
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const form = document.getElementById('upload-form');
        if (form && !Upload.uploadInProgress) {
          form.dispatchEvent(new Event('submit'));
        }
      }
  
      // Escape to reset form
      if (e.key === 'Escape') {
        Upload.resetForm();
        resetFileInput();
      }
    });
  }
  
  function resetFileInput() {
    const label = document.querySelector('label[for="file-input"]');
    if (label) {
      label.innerHTML = `
        <p>Click to select PDF or ZIP file</p>
        <p class="hint">Maximum file size: 50MB</p>
      `;
      label.classList.remove('file-selected', 'file-error');
    }
  }
  
  function restoreFormData() {
    // Restore topic from localStorage if available
    const savedTopic = Utils.loadFromStorage('lastTopic');
    if (savedTopic) {
      const topicInput = document.getElementById('topic-input');
      if (topicInput) {
        topicInput.value = savedTopic;
      }
    }
  
    // Save topic on change
    const topicInput = document.getElementById('topic-input');
    if (topicInput) {
      const debouncedSave = Utils.debounce((value) => {
        Utils.saveToStorage('lastTopic', value);
      }, 1000);
  
      topicInput.addEventListener('input', (e) => {
        debouncedSave(e.target.value);
      });
    }
  }
  
  // NEW: Check server health on startup
  async function checkServerHealth() {
    try {
      const health = await Utils.checkServerHealth();
      if (health.status === 'healthy') {
        console.log('✅ Server health check passed');
      } else {
        console.warn('⚠️ Server health check failed:', health);
        Utils.showNotification('Server connection issues detected', 'warning');
      }
    } catch (error) {
      console.error('❌ Health check error:', error);
      Utils.showNotification('Unable to connect to server', 'error');
    }
  }
  
  // Handle page unload
  window.addEventListener('beforeunload', function(e) {
    if (Upload.uploadInProgress) {
      e.preventDefault();
      e.returnValue = 'Upload is in progress. Are you sure you want to leave?';
      return e.returnValue;
    }
  });
  
  // Handle online/offline status
  window.addEventListener('online', function() {
    Utils.showNotification('Connection restored', 'success');
    checkServerHealth();
  });
  
  window.addEventListener('offline', function() {
    Utils.showNotification('Connection lost', 'warning');
  });
  
  // Error handling
  window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    Utils.showNotification('An unexpected error occurred', 'error');
  });
  
  // Export for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initializeFileInput,
      initializeDragAndDrop,
      checkServerHealth
    };
  }
  