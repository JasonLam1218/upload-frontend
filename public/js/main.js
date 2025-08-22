// START OF FILE main.js

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

  // NEW: Call the function to load exam history when the page loads
  loadExamHistory();

  console.log('All systems ready!');
});

function initializeFileInput() {
  const fileInput = document.getElementById('file-input');
  const fileInfoDiv = document.getElementById('file-info'); // Get the file-info div
  if (!fileInput || !fileInfoDiv) return;

  fileInput.addEventListener('change', function(e) {
    const files = e.target.files; // Get all selected files
    fileInfoDiv.innerHTML = ''; // Clear previous info
    fileInfoDiv.style.display = 'block'; // Show the div

    if (files.length > 0) {
      let allValid = true;
      let fileInfoHtml = '<h4>Selected Files:</h4><ul>';

      Array.from(files).forEach(file => { // Iterate over FileList
          const validation = Utils.validateFile(file); // Validate each file
          fileInfoHtml += `<li><strong>${Utils.escapeHtml(file.name)}</strong> (${Utils.formatFileSize(file.size)}) - `;
          if (validation.valid) {
            fileInfoHtml += `<span class="valid-file">✓ Valid</span></li>`;
          } else {
            fileInfoHtml += `<span class="invalid-file">✗ ${validation.error}</span></li>`;
            allValid = false;
            Utils.showNotification(`File "${file.name}" invalid: ${validation.error}`, 'error'); // Notify for each invalid file
          }
      });
      fileInfoHtml += '</ul>';
      fileInfoDiv.innerHTML = fileInfoHtml;

      const label = document.querySelector('label[for="file-input"]');
      if (label) {
          if (allValid) {
              label.classList.add('file-selected');
              label.classList.remove('file-error');
          } else {
              label.classList.add('file-error');
              label.classList.remove('file-selected');
          }
      }
    } else {
      resetFileInput();
    }
  });
}

function initializeDragAndDrop() {
  const uploadArea = document.querySelector('.upload-form'); // Target the form itself as the drop area
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
    const files = dt.files; // `files` will be a FileList (multiple files)

    if (files.length > 0) {
      const fileInput = document.getElementById('file-input');
      fileInput.files = files; // Assigns the FileList directly

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
      const form = document.getElementById('uploadForm'); // Changed to uploadForm
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
  const fileInfoDiv = document.getElementById('file-info'); // Get the file info div
  if (label) {
    label.innerHTML = `
      Select File(s): <!-- Updated text -->
      <span class="required">*</span>
      <div id="file-help" class="form-help">
          Accepted formats: PDF, ZIP (Max: 50MB per file) <!-- Updated text -->
      </div>
    `;
    label.classList.remove('file-selected', 'file-error');
  }
  if (fileInfoDiv) { // Hide and clear file info div
      fileInfoDiv.style.display = 'none';
      fileInfoDiv.innerHTML = '';
  }
  // Also clear the actual file input value to allow re-selection of the same file
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
      fileInput.value = '';
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

// NEW: Function to fetch and render past exams (MODIFIED TO USE SUPABASE DIRECTLY)
async function loadExamHistory() {
    const examListElement = document.getElementById('exam-list');
    const examHistorySection = document.getElementById('exam-history-section');
    if (!examListElement || !examHistorySection) {
        console.warn('Elements for exam history not found. Skipping loadExamHistory.');
        return;
    }

    Utils.showElement('exam-history-section'); // Show the section
    Utils.updateHTML('exam-list', '<p>Loading past exams from Supabase...</p>'); // Initial loading message

    try {
        const { data: exams, error } = await Utils.fetchExamsFromSupabase(); // Use new utility function

        if (error) {
            throw error; // Propagate error for catch block
        }

        if (exams.length === 0) {
            Utils.updateHTML('exam-list', '<p>No generated exams found yet. Upload a document to create one!</p>');
            return;
        }

        let examListHtml = '';
        exams.forEach(exam => {
            const examJson = exam.exam_json;
            // NEW: Get Vercel Blob URLs from the exam_metadata within exam_json
            // The backend is saving these with types like "question_paper", "model_answers", "marking_scheme"
            const vercelBlobUrls = examJson?.exam_metadata?.vercel_blob_urls || []; 

            const examId = exam.id; // Supabase row ID
            const title = Utils.escapeHtml(exam.title || 'Untitled Exam');
            const topic = Utils.escapeHtml(exam.topic || 'N/A');
            const createdAt = Utils.formatDate(exam.created_at);

            // Helper to find the correct file URL by its type key
            const getFileUrl = (typeKey) => {
                const fileInfo = vercelBlobUrls.find(f => f.type === typeKey);
                return fileInfo ? fileInfo.url : null;
            };

            const questionsUrl = getFileUrl('question_paper');
            const answersUrl = getFileUrl('model_answers');
            const markingUrl = getFileUrl('marking_scheme');

            examListHtml += `
                <li class="exam-item">
                    <h4>${title}</h4>
                    <p><strong>Topic:</strong> ${topic}</p>
                    <p><strong>Generated On:</strong> ${createdAt}</p>
                    <div class="exam-actions">
            `;
            // Prioritize Vercel Blob URLs, fallback to /api/download if not available/valid
            if (questionsUrl && questionsUrl.startsWith('http')) { 
                examListHtml += `<a href="${questionsUrl}" class="btn btn-sm download-btn" download="${examId}_questions.pdf">Questions</a>`;
            } else {
                examListHtml += `<a href="/api/download?examId=${examId}&type=questions" class="btn btn-sm download-btn" download="${examId}_questions.pdf">Questions (Fallback)</a>`;
            }
            if (answersUrl && answersUrl.startsWith('http')) {
                examListHtml += `<a href="${answersUrl}" class="btn btn-sm download-btn" download="${examId}_answers.pdf">Answers</a>`;
            } else {
                examListHtml += `<a href="/api/download?examId=${examId}&type=answers" class="btn btn-sm download-btn" download="${examId}_answers.pdf">Answers (Fallback)</a>`;
            }
            if (markingUrl && markingUrl.startsWith('http')) {
                examListHtml += `<a href="${markingUrl}" class="btn btn-sm download-btn" download="${examId}_marking.pdf">Marking Scheme</a>`;
            } else {
                examListHtml += `<a href="/api/download?examId=${examId}&type=marking" class="btn btn-sm download-btn" download="${examId}_marking.pdf">Marking Scheme (Fallback)</a>`;
            }

            examListHtml += `
                    </div>
                </li>
            `;
        });
        Utils.updateHTML('exam-list', examListHtml);

        // Optional: Add click event listeners for notification when a download starts
        document.querySelectorAll('#exam-history-section .download-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                // Adjust notification based on whether it's a direct Vercel Blob link or proxied by Node.js server
                if (button.href.includes('/api/download')) {
                    Utils.showNotification(`Initiating download for "${button.textContent}" via backend.`, 'info');
                    // No event.preventDefault() here, let the browser handle the /api/download request
                } else {
                    Utils.showNotification(`Initiating direct download for "${button.textContent}".`, 'info');
                }
            });
        });

    } catch (error) {
        console.error('❌ Error fetching exam history:', error);
        Utils.updateHTML('exam-list', `<p class="error-message">Failed to load exam history: ${Utils.escapeHtml(error.message)}</p>`);
        Utils.showNotification('Failed to load past exams from Supabase.', 'error');
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