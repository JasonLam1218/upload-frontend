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
  // Enhanced health check with better error handling
  checkServerHealth: async function() {
    try {
        const response = await fetch('/api/health');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response');
        }
        
        const health = await response.json();
        console.log('✅ Server health check passed:', health);
        
        // Show service status
        if (health.services?.blob_storage === 'unavailable') {
            this.showNotification('Blob storage unavailable - using fallback', 'warning');
        }
        
        return health;
    } catch (error) {
        console.error('❌ Health check failed:', error);
        this.showNotification(`Server connection issue: ${error.message}`, 'error');
        return { status: 'unhealthy', error: error.message };
    }

    console.error('❌ All health check endpoints failed');
    this.showNotification('Server connection failed - all endpoints unreachable', 'error');
    return { status: 'unhealthy', error: 'All endpoints failed' };
  },

  // NEW: Supabase Client and fetch for exams
  supabase: null, // Initialize Supabase client here
  supabaseConfig: null, // To store fetched config

  // Fetches Supabase credentials from the Node.js backend
  fetchSupabaseConfig: async function() {
      if (this.supabaseConfig) return this.supabaseConfig; // Return cached config if already fetched

      try {
          const response = await fetch('/api/config');
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }
          const config = await response.json();
          if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
              throw new Error('Supabase URL or Anon Key not provided by backend config.');
          }
          this.supabaseConfig = config;
          console.log('✅ Supabase config fetched from backend.');
          return config;
      } catch (error) {
          console.error('❌ Failed to fetch Supabase config from backend:', error);
          Utils.showNotification('Failed to load Supabase configuration. Exam history may be unavailable.', 'error');
          return null;
      }
  },

  // Initializes Supabase client using fetched credentials
  initSupabase: async function() { // Made async
    if (this.supabase) return this.supabase; // Already initialized

    const config = await this.fetchSupabaseConfig(); // Await config
    if (!config) {
        console.error('Supabase client not initialized due to missing config.');
        return null;
    }

    const supabaseUrl = config.SUPABASE_URL;
    const supabaseAnonKey = config.SUPABASE_ANON_KEY;

    // `supabase` global object becomes available after the CDN script is loaded in index.html
    if (typeof supabase === 'undefined' || typeof supabase.createClient === 'undefined') {
        console.error('Supabase client library not loaded. Ensure @supabase/supabase-js CDN script is present in index.html.');
        Utils.showNotification('Supabase client library missing. Exam history disabled.', 'error');
        return null;
    }

    this.supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Supabase client initialized.');
    return this.supabase;
  },

  // NEW: Function to fetch exams directly from Supabase
  fetchExamsFromSupabase: async function() {
      const supabaseClient = await this.initSupabase(); // Await initialization
      if (!supabaseClient) {
          console.error('Supabase client not available. Cannot fetch exams.');
          return { data: [], error: new Error('Supabase client not initialized.') };
      }

      try {
          const { data, error } = await supabaseClient
              .from('generated_exams')
              // MODIFIED: Added 'exam_json' to the select statement to retrieve full exam data
              .select('id, title, topic, created_at, exam_json') 
              .order('created_at', { ascending: false });

          if (error) {
              console.error('❌ Supabase fetch error:', error);
              if (error.code === '42501') {
                  return { data: [], error: new Error('Permission denied to access Supabase exams. Check Row Level Security (RLS) policies and your Supabase Anon Key.') };
              }
              throw new Error(`Supabase query failed: ${error.message}`);
          }

          console.log('✅ Exams fetched from Supabase directly:', data);
          return { data, error: null };

      } catch (err) {
          console.error('❌ Error in fetchExamsFromSupabase:', err);
          return { data: [], error: err };
      }
  }
};

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}