document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('generate-form');
  const promptInput = document.getElementById('prompt');
  const generateBtn = document.getElementById('generate-btn');
  const resultDiv = document.getElementById('result');
  const generatedContent = document.getElementById('generated-content');
  const confirmBtn = document.getElementById('confirm-btn');
  const regenerateBtn = document.getElementById('regenerate-btn');
  const successDiv = document.getElementById('success');
  const wpUrl = document.getElementById('wp-url');

  const errorDiv = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');
  const retryBtn = document.getElementById('retry-btn');
  const loadingDiv = document.getElementById('loading');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const statusIndicator = document.getElementById('status-indicator');
  const pythonStatus = document.getElementById('python-status');
  
  // AI Face Elements
  const leftEye = document.querySelector('.left-eye');
  const rightEye = document.querySelector('.right-eye');

  // State
  let lastContent = '';
  let lastMetaImageUrl = '';
  let lastPrompt = '';

  // Initialize
  updateStatus('ready', 'Ready to generate content');
  checkConnections();
  startBlinking();

  // Status Management
  function updateStatus(type, message) {
    statusText.textContent = message;
    statusIndicator.className = `status-indicator ${type}`;
    
    // Update eye colors based on status
    leftEye.className = `eye left-eye ${type}`;
    rightEye.className = `eye right-eye ${type}`;
  }

  function showLoading(message = 'Processing...') {
    updateStatus('loading', message);
    loadingDiv.classList.remove('hidden');
    hideAllOtherStates();
  }

  function hideLoading() {
    loadingDiv.classList.add('hidden');
  }

  function hideAllOtherStates() {
    resultDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
  }

  function showError(message) {
    updateStatus('error', 'Error occurred');
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
    hideLoading();
    stopThinking();
  }

  // AI Face Animations
  function startBlinking() {
    setInterval(() => {
      if (!leftEye.classList.contains('thinking') && !rightEye.classList.contains('thinking')) {
        leftEye.classList.add('blinking');
        rightEye.classList.add('blinking');
        setTimeout(() => {
          leftEye.classList.remove('blinking');
          rightEye.classList.remove('blinking');
          
          // Restore status-based eye colors after blinking
          const currentStatus = statusIndicator.className.replace('status-indicator ', '').replace(' ', '');
          leftEye.className = `eye left-eye ${currentStatus}`;
          rightEye.className = `eye right-eye ${currentStatus}`;
        }, 300);
      }
    }, 3000 + Math.random() * 2000); // Random blink interval between 3-5 seconds
  }

  function startThinking() {
    leftEye.classList.add('thinking');
    rightEye.classList.add('thinking');
  }

  function stopThinking() {
    leftEye.classList.remove('thinking');
    rightEye.classList.remove('thinking');
    
    // Restore status-based eye colors after thinking stops
    const currentStatus = statusIndicator.className.replace('status-indicator ', '').replace(' ', '');
    leftEye.className = `eye left-eye ${currentStatus}`;
    rightEye.className = `eye right-eye ${currentStatus}`;
  }

  function showSuccess() {
    updateStatus('success', 'WordPress post created successfully!');
    successDiv.classList.remove('hidden');
    hideLoading();
    stopThinking();
  }

  // Connection Status
  async function checkConnections() {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      // Check Python server status from health endpoint
      if (data.python_server === 'connected' || data.python_server === 'unknown') {
        pythonStatus.textContent = 'Connected';
        pythonStatus.className = 'status-value connected';
      } else {
        pythonStatus.textContent = 'Not Connected';
        pythonStatus.className = 'status-value error';
      }
    } catch (err) {
      pythonStatus.textContent = 'Unknown';
      pythonStatus.className = 'status-value error';
    }
  }

  // Button Loading States
  function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    if (isLoading) {
      btnText.classList.add('hidden');
      btnLoading.classList.add('show');
      button.disabled = true;
    } else {
      btnText.classList.remove('hidden');
      btnLoading.classList.remove('show');
      button.disabled = false;
    }
  }

  // Generate Content
  async function generateContent(prompt) {
    showLoading('Generating content...');
    setButtonLoading(generateBtn, true);
    startThinking();

    try {
      let body = {};
      if (/^https?:\/\//i.test(prompt)) {
        body.url = prompt;
      } else {
        body.prompt = prompt;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      
      if (!res.ok || !data.content) {
        throw new Error(data.error || 'Failed to generate content');
      }

      generatedContent.textContent = data.content;
      lastContent = data.content;
      lastMetaImageUrl = data.meta_image_url || '';
      lastPrompt = prompt;

      resultDiv.classList.remove('hidden');
      updateStatus('ready', 'Content generated successfully');
      hideLoading();
      setButtonLoading(generateBtn, false);
      stopThinking();

    } catch (err) {
      console.error('Generation error:', err);
      showError(err.message || 'Failed to generate content');
      setButtonLoading(generateBtn, false);
    }
  }

  // Post to WordPress
  async function postToWordPress() {
    showLoading('Posting to WordPress...');
    setButtonLoading(confirmBtn, true);
    startThinking();

    try {
      const res = await fetch('/api/confirm-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: lastContent, 
          meta_image_url: lastMetaImageUrl 
        })
      });

      const data = await res.json();
      
      if (!res.ok || !data.wordpress_url) {
        throw new Error(data.error || 'Failed to post to WordPress');
      }

      wpUrl.href = data.wordpress_url;
      wpUrl.textContent = data.wordpress_url;
      showSuccess();
      setButtonLoading(confirmBtn, false);
      stopThinking();

    } catch (err) {
      console.error('WordPress error:', err);
      showError(err.message || 'Failed to post to WordPress');
      setButtonLoading(confirmBtn, false);
    }
  }

  // Event Listeners
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = promptInput.value.trim();
    if (!value) return;
    
    await generateContent(value);
  });

  confirmBtn.addEventListener('click', postToWordPress);

  regenerateBtn.addEventListener('click', async () => {
    if (lastPrompt) {
      await generateContent(lastPrompt);
    }
  });

  retryBtn.addEventListener('click', async () => {
    if (lastPrompt) {
      await generateContent(lastPrompt);
    }
  });



  // Auto-refresh connection status every 5 minutes (much less frequent)
  setInterval(checkConnections, 300000);
}); 