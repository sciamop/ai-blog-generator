document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('generate-form');
  const promptInput = document.getElementById('prompt');
  const clearPromptBtn = document.getElementById('clear-prompt-btn');
  const generateBtn = document.getElementById('generate-btn');
  const resultDiv = document.getElementById('result');
  const generatedContent = document.getElementById('generated-content');
  const confirmBtn = document.getElementById('confirm-btn');
  const regenerateBtn = document.getElementById('regenerate-btn');
  const regenerateTitleBtn = document.getElementById('regenerate-title-btn');
  const regenerateCategoryBtn = document.getElementById('regenerate-category-btn');
  const postTitleInput = document.getElementById('post-title');
  const postCategoryInput = document.getElementById('post-category');
  const successDiv = document.getElementById('success');
  const wpUrl = document.getElementById('wp-url');

  const errorDiv = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');
  // const retryBtn = document.getElementById('retry-btn');
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
  let lastTitle = '';
  let lastCategory = '';
  let autoPostTimer = null;
  let countdownInterval = null;

  // Initialize
  updateStatus('ready', 'Ready to generate content');
  checkConnections();
  startBlinking();
  
  // Clear button functionality
  clearPromptBtn.addEventListener('click', () => {
    promptInput.value = '';
    promptInput.focus();
  });
  
  // Wait a bit for DOM to be fully ready, then check buttons again
  setTimeout(() => {
    console.log('Delayed button check:', {
      regenerateTitleBtn: !!document.getElementById('regenerate-title-btn'),
      regenerateCategoryBtn: !!document.getElementById('regenerate-category-btn'),
      postTitleInput: !!document.getElementById('post-title'),
      postCategoryInput: !!document.getElementById('post-category')
    });
  }, 1000);

  // Status Management
  function updateStatus(type, message) {
    statusText.textContent = message;
    statusIndicator.className = `status-indicator ${type}`;
    
    // Update eye colors based on status
    leftEye.className = `eye left-eye ${type}`;
    rightEye.className = `eye right-eye ${type}`;
  }

  function showLoading(message = 'Processing...', hideOthers = true) {
    updateStatus('loading', message);
    loadingDiv.classList.remove('hidden');
    generateBtn.classList.add('hidden');
    if (hideOthers) {
      hideAllOtherStates();
    } else {
      // Hide only the result content, keep form visible
      resultDiv.classList.add('hidden');
    }
  }

  function hideLoading() {
    loadingDiv.classList.add('hidden');
    generateBtn.classList.remove('hidden');
  }

  function hideAllOtherStates() {
    resultDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    form.classList.add('hidden');
  }

  function showError(message) {
    console.log('Showing error:', message); // Debug log
    updateStatus('error', 'Error occurred');
    errorMessage.textContent = message;
    hideAllOtherStates(); // Hide other states first
    errorDiv.classList.remove('hidden'); // Then show error
    form.classList.remove('hidden'); // Show the form so user can retry
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
    // Eyes stay in their normal state during loading
    // The teeth animation provides the loading feedback
  }

  function stopThinking() {
    // Eyes return to their status-based colors
    const currentStatus = statusIndicator.className.replace('status-indicator ', '').replace(' ', '');
    leftEye.className = `eye left-eye ${currentStatus}`;
    rightEye.className = `eye right-eye ${currentStatus}`;
  }

  function showSuccess() {
    updateStatus('success', 'WordPress post created successfully!');
    successDiv.classList.remove('hidden');
    hideLoading();
    form.classList.remove('hidden'); // Show the form so user can generate new content
    // Keep result content hidden after successful post
    resultDiv.classList.add('hidden');
    stopThinking();
  }

  // Connection Status
  async function checkConnections() {
    try {
      const response = await fetch('/api/health');
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        const responseText = await response.text();
        if (responseText.includes('login') || responseText.includes('Login') || response.status === 401) {
          console.error('Authentication required');
          showError('Authentication required. Please refresh the page and log in again.');
          return;
        }
        throw jsonError;
      }
      
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

  // Auto-post countdown functions
  function startAutoPostCountdown() {
    // Clear any existing timers
    clearAutoPostTimers();
    
    let timeLeft = 30;
    const totalTime = 30;
    const btnText = confirmBtn.querySelector('.btn-text');
    
    // Add countdown styling
    confirmBtn.classList.add('countdown');
    
    // Update button text immediately
    btnText.textContent = `Post to WordPress (${timeLeft}s)`;
    
    // Update progress bar immediately
    updateProgressBar(timeLeft, totalTime);
    
    // Start countdown interval
    countdownInterval = setInterval(() => {
      timeLeft--;
      btnText.textContent = `Post to WordPress (${timeLeft}s)`;
      
      // Update progress bar
      updateProgressBar(timeLeft, totalTime);
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        postToWordPress();
      }
    }, 1000);
    
    // Set auto-post timer
    autoPostTimer = setTimeout(() => {
      postToWordPress();
    }, 30000);
  }
  
  function updateProgressBar(timeLeft, totalTime) {
    const progress = ((totalTime - timeLeft) / totalTime) * 100;
    confirmBtn.style.setProperty('--progress-width', `${progress}%`);
  }
  
  function clearAutoPostTimers() {
    if (autoPostTimer) {
      clearTimeout(autoPostTimer);
      autoPostTimer = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    // Remove countdown styling and reset progress
    confirmBtn.classList.remove('countdown');
    confirmBtn.style.removeProperty('--progress-width');
    // Reset button text
    const btnText = confirmBtn.querySelector('.btn-text');
    if (btnText) {
      btnText.textContent = 'Post to WordPress';
    }
  }
  
  function cancelAutoPost() {
    clearAutoPostTimers();
  }

  // Small Button Loading States (for regenerate buttons)
  function setSmallButtonLoading(button, isLoading) {
    if (isLoading) {
      button.disabled = true;
      button.textContent = '⏳';
    } else {
      button.disabled = false;
      button.textContent = '🔄';
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

      let data;
      let responseText = '';
      try {
        responseText = await res.text();
        data = JSON.parse(responseText);
        console.log('Response data:', data); // Debug log
      } catch (jsonError) {
        console.error('JSON parse error:', jsonError);
        console.error('Response text:', responseText);
        
        // Check if it's an authentication error (login page)
        if (responseText.includes('login') || responseText.includes('Login') || res.status === 401) {
          throw new Error('Authentication required. Please refresh the page and log in again.');
        }
        
        throw new Error('Server returned invalid JSON response');
      }
      
      if (!res.ok) {
        console.log('Response not ok, status:', res.status); // Debug log
        if (data.error_type === 'blacklisted') {
          console.log('Blacklisted domain detected:', data.blacklisted_domain); // Debug log
          throw new Error(`🚫 Domain "${data.blacklisted_domain}" is blacklisted due to previous errors. Try a different URL.`);
        }
        throw new Error(data.error || 'Failed to generate content');
      }
      
      if (!data.content) {
        throw new Error('Failed to generate content');
      }

      generatedContent.textContent = data.content;
      lastContent = data.content;
      lastMetaImageUrl = data.meta_image_url || '';
      lastTitle = data.title || '';
      lastCategory = data.category || '';
      lastPrompt = prompt;

      // Populate title and category fields
      postTitleInput.value = lastTitle;
      postCategoryInput.value = lastCategory;

      resultDiv.classList.remove('hidden');
      updateStatus('ready', 'Content generated successfully');
      hideLoading();
      setButtonLoading(generateBtn, false);
      stopThinking();
      
      // Start auto-post countdown
      startAutoPostCountdown();
      
      // Re-attach event listeners for the regenerate buttons after content is shown
      setTimeout(() => {
        const titleBtn = document.getElementById('regenerate-title-btn');
        const categoryBtn = document.getElementById('regenerate-category-btn');
        
        if (titleBtn) {
          // Remove existing listener if any
          titleBtn.replaceWith(titleBtn.cloneNode(true));
          const newTitleBtn = document.getElementById('regenerate-title-btn');
          newTitleBtn.addEventListener('click', regenerateTitle);
          console.log('Title regenerate button event listener re-attached');
        }
        
        if (categoryBtn) {
          // Remove existing listener if any
          categoryBtn.replaceWith(categoryBtn.cloneNode(true));
          const newCategoryBtn = document.getElementById('regenerate-category-btn');
          newCategoryBtn.addEventListener('click', regenerateCategory);
          console.log('Category regenerate button event listener re-attached');
        }
      }, 100);

    } catch (err) {
      console.error('Generation error:', err);
      showError(err.message || 'Failed to generate content');
      setButtonLoading(generateBtn, false);
    }
  }

  // Regenerate Title
  async function regenerateTitle() {
    console.log('Regenerate title function called!');
    if (!lastContent) return;
    
    // Reset the post button countdown immediately when button is pressed
    startAutoPostCountdown();
    
    console.log('Regenerating title for content:', lastContent.substring(0, 100) + '...');
    setSmallButtonLoading(regenerateTitleBtn, true);
    try {
      const res = await fetch('/api/regenerate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: lastContent })
      });

      console.log('Title regeneration response status:', res.status);
      let data;
      try {
        data = await res.json();
        console.log('Title regeneration response data:', data);
      } catch (jsonError) {
        const responseText = await res.text();
        console.error('Title regeneration JSON parse error:', jsonError);
        console.error('Title regeneration response text:', responseText);
        if (responseText.includes('login') || responseText.includes('Login') || res.status === 401) {
          throw new Error('Authentication required. Please refresh the page and log in again.');
        }
        throw new Error('Server returned invalid JSON response');
      }
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate title');
      }

      lastTitle = data.title || 'Blog Post';
      postTitleInput.value = lastTitle;
      console.log('Title regenerated successfully:', lastTitle);
      setSmallButtonLoading(regenerateTitleBtn, false);

    } catch (err) {
      console.error('Title regeneration error:', err);
      showError(err.message || 'Failed to regenerate title');
      setSmallButtonLoading(regenerateTitleBtn, false);
    }
  }

  // Regenerate Category
  async function regenerateCategory() {
    console.log('Regenerate category function called!');
    if (!lastContent) return;
    
    // Reset the post button countdown immediately when button is pressed
    startAutoPostCountdown();
    
    setSmallButtonLoading(regenerateCategoryBtn, true);
    try {
      const res = await fetch('/api/regenerate-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: lastContent })
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        const responseText = await res.text();
        if (responseText.includes('login') || responseText.includes('Login') || res.status === 401) {
          throw new Error('Authentication required. Please refresh the page and log in again.');
        }
        throw new Error('Server returned invalid JSON response');
      }
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate category');
      }

      lastCategory = data.category || 'General';
      postCategoryInput.value = lastCategory;
      setSmallButtonLoading(regenerateCategoryBtn, false);

    } catch (err) {
      console.error('Category regeneration error:', err);
      showError(err.message || 'Failed to regenerate category');
      setSmallButtonLoading(regenerateCategoryBtn, false);
    }
  }

  // Post to WordPress
  async function postToWordPress() {
    // Clear auto-post timers since we're posting now
    clearAutoPostTimers();
    
    showLoading('Posting to WordPress...', false);
    setButtonLoading(confirmBtn, true);
    startThinking();

    try {
      const res = await fetch('/api/confirm-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: lastContent, 
          meta_image_url: lastMetaImageUrl,
          title: postTitleInput.value.trim() || lastTitle,
          category: postCategoryInput.value.trim() || lastCategory
        })
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        const responseText = await res.text();
        if (responseText.includes('login') || responseText.includes('Login') || res.status === 401) {
          throw new Error('Authentication required. Please refresh the page and log in again.');
        }
        throw new Error('Server returned invalid JSON response');
      }
      
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

  confirmBtn.addEventListener('click', () => {
    // If auto-post is running, cancel it and post immediately
    if (autoPostTimer || countdownInterval) {
      cancelAutoPost();
      postToWordPress();
    } else {
      postToWordPress();
    }
  });

  regenerateBtn.addEventListener('click', async () => {
    if (lastPrompt) {
      await generateContent(lastPrompt);
    }
  });

  if (regenerateTitleBtn) {
    regenerateTitleBtn.addEventListener('click', regenerateTitle);
    console.log('Title regenerate button event listener added');
  } else {
    console.error('Title regenerate button not found in DOM');
  }
  
  if (regenerateCategoryBtn) {
    regenerateCategoryBtn.addEventListener('click', regenerateCategory);
    console.log('Category regenerate button event listener added');
  } else {
    console.error('Category regenerate button not found in DOM');
  }

  retryBtn.addEventListener('click', async () => {
    if (lastPrompt) {
      await generateContent(lastPrompt);
    }
  });



  // Test debug endpoint
  async function testDebug() {
    try {
      const response = await fetch('/api/debug');
      const data = await response.json();
      console.log('Debug endpoint test:', data);
    } catch (err) {
      console.error('Debug endpoint test failed:', err);
    }
  }

  // Test debug endpoint on load
  testDebug();

  // Auto-refresh connection status every 5 minutes (much less frequent)
  setInterval(checkConnections, 300000);
}); 