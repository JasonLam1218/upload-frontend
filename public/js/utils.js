// Utility functions
const Utils = {
    // Show/hide elements
    showElement: function(elementId) {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.display = 'block';
        element.classList.add('fade-in');
      }
    },
  
    hideElement: function(elementId) {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.display = 'none';
        element.classList.remove('fade-in');
      }
    },
  
    // Update element content
    updateContent: function(elementId, content) {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = content;
      }
    },
  
    updateHTML: function(elementId, html) {
      const element = document.getElementById(elementId);
      if (element) {
        element.innerHTML = html;
      }
    },
  
    // Format file size
    formatFileSize: function(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
  
    // Validate file type and size - UPDATED to match backend
    validateFile: function(file) {
      const allowedTypes = [
        'application/pdf', 
        'application/zip', 
        'application/x-zip-compressed',
        'application/x-zip'
      ];
      const maxSize = 50 * 1024 * 1024; // Updated to 50MB to match backend
      const minSize = 1024; // 1KB minimum
  
      // Check file type
      if (!allowedTypes.includes(file.type)) {
        return {
          valid: false,
          error: 'Only PDF and ZIP files are allowed'
        };
      }
  
      // Check file size
      if (file.size > maxSize) {
        return {
          valid: false,
          error: `File size must be less than ${this.formatFileSize(maxSize)}`
        };
      }
  
      // Check if file is too small
      if (file.size < minSize) {
        return {
          valid: false,
          error: 'File appears to be too small or empty'
        };
      }
  
      return { valid: true };
    },
  
    // Show notification
    showNotification: function(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      
      // Style the notification
      Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 20px',
        borderRadius: '4px',
        color: 'white',
        fontWeight: 'bold',
        zIndex: '1000',
        maxWidth: '300px',
        backgroundColor: type === 'error' ? '#dc3545' :
                        type === 'success' ? '#28a745' :
                        type === 'warning' ? '#ffc107' : '#007bff'
      });
  
      document.body.appendChild(notification);
  
      // Remove after 5 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 5000);
    },
  
    // Local storage helpers
    saveToStorage: function(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    },
  
    loadFromStorage: function(key) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch (e) {
        console.warn('Could not load from localStorage:', e);
        return null;
      }
    },
  
    // Debounce function for performance
    debounce: function(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
  
    // Generate unique ID
    generateId: function() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
  
    // Format date
    formatDate: function(date) {
      return new Date(date).toLocaleString();
    },
  
    // Escape HTML
    escapeHtml: function(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
  
    // NEW: API health check
    checkServerHealth: async function() {
      try {
        const response = await fetch('/api/health');
        const health = await response.json();
        return health;
      } catch (error) {
        console.error('Health check failed:', error);
        return { status: 'unhealthy', error: error.message };
      }
    }
  };
  
  // Export for module systems if available
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
  }
  