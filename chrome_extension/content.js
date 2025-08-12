// Content script for YouTube pages

console.log('🎥 YouTube Summarizer content script loaded');

// Global variables
let summaryPanel = null;
let currentVideoId = null;
let isProcessing = false;
let summaryCheckInterval = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('📨 Received message:', request);
  
  if (request.action === 'getVideoInfo') {
    const videoInfo = extractVideoInfo();
    console.log('📹 Extracted video info:', videoInfo);
    
    if (videoInfo && videoInfo.videoId) {
      sendResponse({
        success: true,
        videoInfo: videoInfo
      });
    } else {
      sendResponse({
        success: false,
        error: 'Could not extract video information from this page'
      });
      return;
    }
  }
  
  // Handle summary requests directly in content script
  if (request.action === 'summarizeVideo') {
    console.log('🎯 Starting summarization from content script...');
    startSummarization(request.videoInfo);
    sendResponse({ success: true, processing: true });
    return;
  }
  
  // Forward messages from background script to popup
  if (request.action === 'summaryReady' || request.action === 'statusUpdate') {
    console.log('📤 Forwarding message to popup:', request);
    // Forward the message to any open popups
    try {
      chrome.runtime.sendMessage(request);
    } catch (error) {
      console.log('❌ Error forwarding message to popup:', error);
    }
  }
});

// Function to check for completed summaries when content script becomes active
async function checkForCompletedSummaries() {
  if (!currentVideoId) {
    console.log('🔍 No current video ID, skipping summary check');
    return;
  }
  
  try {
    console.log('🔍 Checking for completed summaries for video:', currentVideoId, '(page hidden:', document.hidden, ')');
    
    // Check Chrome storage for completed summary
    const result = await chrome.storage.local.get([`summaryResult_${currentVideoId}`]);
    const storedResult = result[`summaryResult_${currentVideoId}`];
    
    console.log('🔍 Chrome storage result:', storedResult);
    
    if (storedResult && storedResult.summary) {
      console.log('📋 Found completed summary in storage, displaying immediately!');
      console.log('📋 Summary length:', storedResult.summary.length);
      console.log('📋 Summary preview:', storedResult.summary.substring(0, 100) + '...');
      
      // Always extract fresh video info to get the current video title
      const currentVideoInfo = extractVideoInfo();
      if (currentVideoInfo && currentVideoInfo.videoId === currentVideoId) {
        // Use the fresh title from the current page
        displayResult(storedResult.summary, false, currentVideoInfo.title);
      } else {
        // Fallback to default title extraction
        displayResult(storedResult.summary);
      }
      
      // Clear the stored result to avoid duplicates
      await chrome.storage.local.remove([`summaryResult_${currentVideoId}`]);
      console.log('🧹 Cleared stored result from storage');
      return;
    }
    
    // Check for error results
    const errorResult = await chrome.storage.local.get([`errorResult_${currentVideoId}`]);
    const storedError = errorResult[`errorResult_${currentVideoId}`];
    
    console.log('🔍 Error storage result:', storedError);
    
    if (storedError && storedError.error) {
      console.log('❌ Found error result in storage, displaying immediately!');
      displayError(storedError.error);
      
      // Clear the stored error to avoid duplicates
      await chrome.storage.local.remove([`errorResult_${currentVideoId}`]);
      console.log('🧹 Cleared stored error from storage');
      return;
    }
    
    // Check if there's an active task
    console.log('🔍 Checking for active tasks...');
    const taskStatus = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'getTaskStatus',
        videoId: currentVideoId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('❌ Error getting task status:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
    
    console.log('🔍 Task status result:', taskStatus);
    
    if (taskStatus && taskStatus.status === 'completed' && taskStatus.summary) {
      console.log('✅ Found completed task with summary, displaying immediately!');
      console.log('✅ Summary length:', taskStatus.summary.length);
      displayResult(taskStatus.summary);
      return;
    }
    
    // Check for cached summary as final fallback
    console.log('🔍 Checking for cached summary...');
    await checkForCachedSummary(currentVideoId);
    
    console.log('🔍 Summary check completed for video:', currentVideoId);
    
  } catch (error) {
    console.error('❌ Error checking for completed summaries:', error);
  }
}

// Function to inject the summary panel into the YouTube page
function injectSummaryPanel() {
  if (summaryPanel) {
    console.log('🔄 Summary panel already exists, removing...');
    summaryPanel.remove();
  }

  // Create the summary panel
  summaryPanel = document.createElement('div');
  summaryPanel.id = 'youtube-summarizer-panel';
  summaryPanel.innerHTML = `
    <div class="youtube-summarizer-container">
      <div class="youtube-summarizer-header">
        <h3>🎥 AI Summary</h3>
        <div class="youtube-summarizer-header-controls">
          <button id="youtube-summarizer-toggle" class="youtube-summarizer-toggle">−</button>
        </div>
      </div>
      <div class="youtube-summarizer-content">
        <button id="youtube-summarizer-btn" class="youtube-summarizer-btn" disabled>
          <span class="youtube-summarizer-spinner"></span>
          Loading...
        </button>
        <div id="youtube-summarizer-status" class="youtube-summarizer-status" style="display: none;">
          <div id="youtube-summarizer-result"></div>
          <progress id="youtube-summarizer-progress" value="0" max="100"></progress>
          <p id="youtube-summarizer-progress-text">Initializing...</p>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const styles = document.createElement('style');
  styles.textContent = `
    #youtube-summarizer-panel {
      width: 100%;
      margin-bottom: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 400px;
    }
    
    .youtube-summarizer-container {
      background: rgba(28, 28, 28, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    .youtube-summarizer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .youtube-summarizer-header h3 {
      margin: 0;
      color: white;
      font-size: 16px;
      font-weight: 600;
    }
    
    .youtube-summarizer-header-controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }


    
    .youtube-summarizer-toggle {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s;
    }
    
    .youtube-summarizer-toggle:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .youtube-summarizer-content {
      padding: 16px;
    }
    
    .youtube-summarizer-btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #00b894 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-bottom: 16px;
    }
    
    .youtube-summarizer-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 50%, #00a085 100%);
    }
    
    .youtube-summarizer-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .youtube-summarizer-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s ease-in-out infinite;
      margin-right: 8px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .youtube-summarizer-status {
      margin-top: 16px;
    }
    
    .youtube-summarizer-result {
      margin-bottom: 16px;
    }
    
    .youtube-summarizer-summary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .youtube-summarizer-summary h4 {
      margin: 0 0 12px 0;
      color: white;
      font-size: 16px;
      font-weight: 600;
    }
    
    .youtube-summarizer-summary-content {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.4;
      max-height: 150px;
      overflow-y: auto;
      color: rgba(255, 255, 255, 0.9);
    }
    
    .youtube-summarizer-summary-content p {
      margin: 0 0 6px 0;
    }
    
    .youtube-summarizer-summary-content p:last-child {
      margin-bottom: 0;
    }
    
    .youtube-summarizer-actions {
      display: flex;
      gap: 8px;
    }
    
    .youtube-summarizer-action-btn {
      flex: 1;
      padding: 6px 10px;
      background: #00b894;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s ease;
    }
    
    .youtube-summarizer-action-btn:hover {
      background: #00a085;
      transform: translateY(-1px);
    }
    
    #youtube-summarizer-progress {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      margin-bottom: 8px;
    }
    
    #youtube-summarizer-progress::-webkit-progress-bar {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    
    #youtube-summarizer-progress::-webkit-progress-value {
      background: linear-gradient(45deg, #00b894, #00cec9);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    #youtube-summarizer-progress-text {
      margin: 0 0 8px 0;
      font-size: 12px;
      text-align: center;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 500;
    }
    

    
    .youtube-summarizer-error {
      background: rgba(255, 107, 107, 0.2);
      border: 1px solid rgba(255, 107, 107, 0.4);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .youtube-summarizer-error h4 {
      margin: 0 0 8px 0;
      color: #ff6b6b;
      font-size: 14px;
    }
    
    .youtube-summarizer-error p {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
    }
    
    .youtube-summarizer-collapsed .youtube-summarizer-content {
      display: none;
    }
    
    .youtube-summarizer-collapsed .youtube-summarizer-toggle {
      transform: rotate(180deg);
    }
     
     /* Removed summaryFound animation - no longer needed */
  `;

  // Insert styles into the page
  document.head.appendChild(styles);

  // Try to find the right sidebar where video recommendations are displayed
  let targetContainer = null;
  
  // Method 1: Look for the secondary column (right sidebar)
  targetContainer = document.querySelector('#secondary');
  
  // Method 2: Look for the secondary column with more specific selectors
  if (!targetContainer) {
    targetContainer = document.querySelector('#secondary-inner');
  }
  
  // Method 3: Look for the secondary column with alternative selectors
  if (!targetContainer) {
    targetContainer = document.querySelector('ytd-watch-flexy[theater] #secondary, ytd-watch-flexy:not([theater]) #secondary');
  }
  
  // Method 4: Look for any element that contains video recommendations
  if (!targetContainer) {
    const possibleContainers = [
      '[class*="secondary"]',
      '[class*="Secondary"]',
      '[id*="secondary"]',
      '[id*="Secondary"]'
    ];
    
    for (let selector of possibleContainers) {
      const elements = document.querySelectorAll(selector);
      for (let element of elements) {
        // Check if this element contains video recommendations
        const hasRecommendations = element.querySelector('[class*="video-list"], [class*="VideoList"], [class*="recommendation"], [class*="Recommendation"]');
        if (hasRecommendations) {
          targetContainer = element;
          break;
        }
      }
      if (targetContainer) break;
    }
  }
  
  // Method 5: Look for the main content area and insert before it
  if (!targetContainer) {
    targetContainer = document.querySelector('#primary');
  }
  
  if (targetContainer) {
    console.log('✅ Found target container:', targetContainer);
    
    // Insert the panel at the beginning of the target container
    // This will push down all the content below it
    targetContainer.insertBefore(summaryPanel, targetContainer.firstChild);
    
    console.log('✅ Summary panel injected into target container');
  } else {
    console.log('⚠️ Could not find target container, falling back to body injection');
    // Fallback: inject into body (this won't push down content but will at least show the panel)
    document.body.appendChild(summaryPanel);
  }

  // Add event listeners
  setupPanelEventListeners();
  
  console.log('✅ Summary panel injected successfully');
}

// Setup event listeners for the panel
function setupPanelEventListeners() {
  if (!summaryPanel) return;

  // Toggle button
  const toggleBtn = summaryPanel.querySelector('#youtube-summarizer-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      summaryPanel.classList.toggle('youtube-summarizer-collapsed');
      this.textContent = summaryPanel.classList.contains('youtube-summarizer-collapsed') ? '+' : '−';
    });
  }

  // Summarize button
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  if (summarizeBtn) {
    summarizeBtn.addEventListener('click', function() {
      if (currentVideoId) {
        startSummarization({ videoId: currentVideoId });
      }
    });
  }


}

// Function to update the video info display
function updateVideoInfoDisplay(videoInfo) {
  if (!summaryPanel) return;
  
  // Enable the summarize button
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  if (summarizeBtn) {
    summarizeBtn.disabled = false;
    summarizeBtn.innerHTML = '🚀 Generate Summary';
  }
}

// Function to start summarization
function startSummarization(videoInfo) {
  if (isProcessing) {
    console.log('🔄 Summarization already in progress...');
    return;
  }

  isProcessing = true;
  currentVideoId = videoInfo.videoId;
  
  // Always refresh the YouTube title when generate is clicked
  const freshVideoInfo = extractVideoInfo();
  if (freshVideoInfo && freshVideoInfo.videoId === videoInfo.videoId) {
    console.log('🔄 Refreshed video title:', freshVideoInfo.title);
    // Store the fresh title for use in display
    sessionStorage.setItem('youtubeSummarizer_freshTitle', freshVideoInfo.title);
  }
  
  // Clear any existing summary display before starting new summarization
  clearSummaryDisplay();
  
  // Update UI to show processing state
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  const statusDiv = summaryPanel.querySelector('#youtube-summarizer-status');
  const resultDiv = summaryPanel.querySelector('#youtube-summarizer-result');
  const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
  const progressText = summaryPanel.querySelector('#youtube-summarizer-progress-text');
  
  if (summarizeBtn) {
    summarizeBtn.disabled = true;
    summarizeBtn.innerHTML = '<span class="youtube-summarizer-spinner"></span>Processing...';
  }
  
  if (statusDiv) {
    statusDiv.style.display = 'block';
  }
  
  if (resultDiv) {
    resultDiv.innerHTML = '';
  }
  
  // Send message to background script to start summarization
  chrome.runtime.sendMessage({
    action: 'summarizeVideo',
    videoInfo: videoInfo
  }, function(response) {
    if (response && response.success) {
      console.log('✅ Summarization started successfully');
      updateProgress('🚀 Starting summarization...');
      startSummaryChecking(); // Start checking for completion
      startActivePageChecking(); // Start checking for completed summaries when page is active
      startContinuousMonitoring(); // Start continuous monitoring
    } else {
      console.error('❌ Failed to start summarization:', response?.error);
      displayError(response?.error || 'Failed to start summarization');
      isProcessing = false;
      stopSummaryChecking(); // Stop checking on failure
      stopActivePageChecking(); // Stop checking on failure
      stopContinuousMonitoring(); // Stop continuous monitoring on failure
      if (summarizeBtn) {
        summarizeBtn.disabled = false;
        summarizeBtn.innerHTML = '🚀 Generate Summary';
      }
    }
  });
}

// Function to update progress
function updateProgress(status, skipLogging = false) {
  if (!summaryPanel) return;
  
  const progressText = summaryPanel.querySelector('#youtube-summarizer-progress-text');
  const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
  
  if (progressText) {
    progressText.textContent = status;
  }
  
  if (progressBar) {
    let progress = 0;
    if (status.includes('Downloading audio')) progress = 30;
    else if (status.includes('Transcribing audio')) progress = 65;
    else if (status.includes('Summarizing with Gemini')) progress = 90;
    else if (status.includes('Summarization successful')) progress = 100;
    else if (status.includes('Failed') || status.includes('Error')) progress = 0;
    
    progressBar.value = progress;
  }
  

}



// Function to display results
function displayResult(summary, cached = false, customTitle = null) {
  if (!summaryPanel) return;
  
  isProcessing = false;
  stopSummaryChecking(); // Stop checking when result is displayed
  stopActivePageChecking(); // Stop checking when result is displayed
  stopContinuousMonitoring(); // Stop continuous monitoring when result is displayed
  
  const resultDiv = summaryPanel.querySelector('#youtube-summarizer-result');
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  
  if (resultDiv) {
    // Get the video title from the page or use custom title
    let videoTitle = customTitle || 'this video';
    
    if (!customTitle) {
      // First try to use the fresh title we just extracted
      const freshTitle = sessionStorage.getItem('youtubeSummarizer_freshTitle');
      if (freshTitle) {
        videoTitle = freshTitle;
        console.log('🔄 Using fresh title from generate button click:', videoTitle);
        // Clear the stored title after using it
        sessionStorage.removeItem('youtubeSummarizer_freshTitle');
      } else {
        // Fallback to extracting from page
        try {
          const metaTitle = document.querySelector('meta[property="og:title"]');
          if (metaTitle) {
            videoTitle = metaTitle.getAttribute('content');
          } else {
            const h1Title = document.querySelector('h1.ytd-video-primary-info-renderer');
            if (h1Title) {
              videoTitle = h1Title.textContent.trim();
            } else {
              const altH1Title = document.querySelector('h1.style-scope.ytd-watch-metadata');
              if (altH1Title) {
                videoTitle = altH1Title.textContent.trim();
              }
            }
          }
        } catch (error) {
          console.log('Could not extract video title for summary header');
        }
      }
    }
    
    // Format the summary with proper line breaks and paragraphs
    const formattedSummary = summary
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => `<p>${line.trim()}</p>`)
      .join('');
    
    resultDiv.innerHTML = `
      <div class="youtube-summarizer-summary">
        <div class="youtube-summarizer-summary-content">
          ${formattedSummary}
        </div>
        <div class="youtube-summarizer-actions">
          <button class="youtube-summarizer-action-btn" id="copy-summary-btn">📋 Copy</button>
          <button class="youtube-summarizer-action-btn" id="save-summary-btn">💾 Save</button>
        </div>
      </div>
    `;
  }
  
  if (summarizeBtn) {
    summarizeBtn.disabled = false;
    summarizeBtn.innerHTML = '🚀 Generate Summary';
  }
  
  // Update progress to show completion
  updateProgress('✅ Summarization successful!', true);
  const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
  if (progressBar) {
    progressBar.value = 100;
  }
  
  // Make the summary panel more visible with a highlight effect
  // summaryPanel.style.animation = 'summaryFound 2s ease-in-out'; // Removed animation
  
  // Scroll the summary panel into view
  summaryPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Show browser notification if available and user is not on the page
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('🎥 YouTube Summary Ready!', {
      body: `Your summary for "${videoTitle}" is ready!`,
      icon: 'https://www.youtube.com/favicon.ico',
      tag: 'youtube-summarizer'
    });
  }
  
  // Also try to request notification permission if not granted
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  
  // Add event listeners for copy and save buttons
  const copyBtn = summaryPanel.querySelector('#copy-summary-btn');
  const saveBtn = summaryPanel.querySelector('#save-summary-btn');
  
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(summary).then(() => {
        this.textContent = '✅ Copied!';
        setTimeout(() => {
          this.textContent = '📋 Copy';
        }, 2000);
      }).catch((error) => {
        console.error('Failed to copy text:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summary;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        this.textContent = '✅ Copied!';
        setTimeout(() => {
          this.textContent = '📋 Copy';
        }, 2000);
      });
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      const blob = new Blob([summary], {type: 'text/plain'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'youtube_summary.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

// Function to display errors
function displayError(error) {
  if (!summaryPanel) return;
  
  isProcessing = false;
  stopSummaryChecking(); // Stop checking when error is displayed
  stopActivePageChecking(); // Stop checking when error is displayed
  stopContinuousMonitoring(); // Stop continuous monitoring when error is displayed
  
  const resultDiv = summaryPanel.querySelector('#youtube-summarizer-result');
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="youtube-summarizer-error">
        <h4>❌ Error</h4>
        <p>${error}</p>
      </div>
    `;
  }
  
  if (summarizeBtn) {
    summarizeBtn.disabled = false;
    summarizeBtn.innerHTML = '🚀 Generate Summary';
  }
  
  // Update progress to show error
  updateProgress('❌ Summarization failed', true);
  const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
  if (progressBar) {
    progressBar.value = 0;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('📨 Content script received message:', request);
  
  if (request.action === 'statusUpdate' && request.videoId === currentVideoId) {
    updateProgress(request.status);
  } else if (request.action === 'summaryReady' && request.videoId === currentVideoId) {
    displayResult(request.summary);
  }
});

// Listen for page visibility changes to check for completed summaries
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && currentVideoId) {
    console.log('👁️ Page became visible, checking for completed summaries...');
    // Multiple checks with different delays to ensure we catch the summary
    setTimeout(() => {
      console.log('🔍 First visibility check for completed summaries...');
      checkForCompletedSummaries();
    }, 100);
    
    setTimeout(() => {
      console.log('🔍 Second visibility check for completed summaries...');
      checkForCompletedSummaries();
    }, 1000);
    
    setTimeout(() => {
      console.log('🔍 Third visibility check for completed summaries...');
      checkForCompletedSummaries();
    }, 3000);
    
    // Also check if we're still processing and need to restart monitoring
    if (isProcessing) {
      console.log('🔄 Page became visible while processing, ensuring monitoring continues...');
      startContinuousMonitoring();
      
      // Force an immediate check for completed summaries
      setTimeout(() => {
        console.log('🔍 Forcing immediate check after page became visible...');
        checkForCompletedSummaries();
      }, 100);
    }
  } else if (document.hidden && currentVideoId) {
    console.log('👁️ Page became hidden, but continuous monitoring will continue...');
  }
});

// Listen for window focus events as additional trigger
window.addEventListener('focus', function() {
  if (currentVideoId) {
    console.log('🎯 Window focused, checking for completed summaries...');
    // Multiple checks with different delays to ensure we catch the summary
    setTimeout(() => {
      console.log('🔍 First focus check for completed summaries...');
      checkForCompletedSummaries();
    }, 100);
    
    setTimeout(() => {
      console.log('🔍 Second focus check for completed summaries...');
      checkForCompletedSummaries();
    }, 1000);
    
    setTimeout(() => {
      console.log('🔍 Third focus check for completed summaries...');
      checkForCompletedSummaries();
    }, 3000);
  }
});

// Set up periodic checking for completed summaries when processing
function startSummaryChecking() {
  if (summaryCheckInterval) {
    clearInterval(summaryCheckInterval);
  }
  
  summaryCheckInterval = setInterval(async () => {
    if (currentVideoId && isProcessing) {
      // Check every 500ms while processing, regardless of page visibility
      console.log('🔍 Processing check (page hidden:', document.hidden, ')');
      await checkForCompletedSummaries();
    }
  }, 500); // Check every 500ms while processing (more aggressive)
}

function stopSummaryChecking() {
  if (summaryCheckInterval) {
    clearInterval(summaryCheckInterval);
    summaryCheckInterval = null;
  }
}

// Also set up periodic checking for completed summaries when page is active (not just when processing)
let activePageCheckInterval = null;

function startActivePageChecking() {
  if (activePageCheckInterval) {
    clearInterval(activePageCheckInterval);
  }
  
  activePageCheckInterval = setInterval(async () => {
    if (currentVideoId && !isProcessing) {
      // Check for completed summaries regardless of page visibility
      console.log('🔍 Active page check (page hidden:', document.hidden, ')');
      await checkForCompletedSummaries();
    }
  }, 2000); // Check every 2 seconds when page is active
}

function stopActivePageChecking() {
  if (activePageCheckInterval) {
    clearInterval(activePageCheckInterval);
    activePageCheckInterval = null;
  }
}

// Add a more aggressive monitoring system that runs continuously
let continuousMonitoringInterval = null;

function startContinuousMonitoring() {
  if (continuousMonitoringInterval) {
    clearInterval(continuousMonitoringInterval);
  }
  
  continuousMonitoringInterval = setInterval(async () => {
    if (currentVideoId) {
      // Always check for completed summaries, regardless of processing state or page visibility
      console.log('🔍 Continuous monitoring check (page hidden:', document.hidden, ')');
      await checkForCompletedSummaries();
    }
  }, 1000); // Check every 1 second continuously
}

function stopContinuousMonitoring() {
  if (continuousMonitoringInterval) {
    clearInterval(continuousMonitoringInterval);
    continuousMonitoringInterval = null;
  }
}

function extractVideoInfo() {
  try {
    console.log('🔍 Extracting video info from:', window.location.href);
    
    // Check if we're on a YouTube video page
    if (!window.location.hostname.includes('youtube.com') || 
        !window.location.pathname.includes('/watch')) {
      console.log('❌ Not on a YouTube video page');
      return null;
    }
    
    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log('🎯 Video ID:', videoId);
    
    if (!videoId) {
      console.log('❌ No video ID found in URL');
      return null;
    }

    // Try multiple selectors to get the video title
    let title = null;
    
    // Method 1: Meta tag (most reliable)
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) {
      title = metaTitle.getAttribute('content');
      console.log('📋 Title from meta tag:', title);
    }
    
    // Method 2: YouTube's h1 title (newer selector)
    if (!title) {
      const h1Title = document.querySelector('h1.ytd-video-primary-info-renderer');
      if (h1Title) {
        title = h1Title.textContent.trim();
        console.log('📋 Title from h1:', title);
      }
    }
    
    // Method 3: Alternative h1 selector
    if (!title) {
      const h1Title = document.querySelector('h1.style-scope.ytd-watch-metadata');
      if (h1Title) {
        title = h1Title.textContent.trim();
        console.log('📋 Title from alternative h1:', title);
      }
    }
    
    // Method 4: Page title
    if (!title) {
      title = document.title.replace(' - YouTube', '');
      console.log('📋 Title from page title:', title);
    }
    
    // Method 5: Look for any title-like element with more specific selectors
    if (!title) {
      const titleSelectors = [
        '[class*="title"]',
        '[class*="Title"]',
        'h1',
        'h2',
        '[data-testid*="title"]'
      ];
      
      for (let selector of titleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (let element of elements) {
          const text = element.textContent.trim();
          if (text && text.length > 5 && text.length < 200 && 
              !text.includes('YouTube') && !text.includes('Sign in')) {
            title = text;
            console.log('📋 Title from selector', selector, ':', title);
            break;
          }
        }
        if (title) break;
      }
    }

    // Method 6: Fallback to video ID if no title found
    if (!title) {
      console.log('⚠️ Title not found, using fallback...');
      title = `YouTube Video ${videoId}`;
    }

    const result = {
      videoId: videoId,
      title: title,
      url: window.location.href
    };
    
    console.log('✅ Final video info:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error extracting video info:', error);
    return null;
  }
}

// Auto-extract and store video info when page loads
function autoExtractVideoInfo() {
  console.log('🔄 Auto-extracting video info...');
  
  if (window.location.hostname.includes('youtube.com') && 
      window.location.pathname.includes('/watch')) {
    
    // Clear any cached video info first
    sessionStorage.removeItem('youtubeSummarizer_videoInfo');
    
    // Clear any existing summary display when navigating to a new video
    if (summaryPanel) {
      clearSummaryDisplay();
      console.log('🧹 Cleared existing summary display for new video');
    }
    
    // Also reset the current video ID to ensure clean state
    currentVideoId = null;
    isProcessing = false;
    
    // Wait a bit for the page to fully load
    setTimeout(async () => {
      const videoInfo = extractVideoInfo();
      if (videoInfo) {
        // Store in session storage for quick access
        sessionStorage.setItem('youtubeSummarizer_videoInfo', JSON.stringify(videoInfo));
        console.log('💾 Stored video info in session storage');
        
        // Update current video ID
        currentVideoId = videoInfo.videoId;
        
        // Inject or update the summary panel
        if (!summaryPanel) {
          injectSummaryPanel();
        }
        
        // Update the video info display
        updateVideoInfoDisplay(videoInfo);
        
        // Start active page checking to look for completed summaries
        startActivePageChecking();
        startContinuousMonitoring(); // Start continuous monitoring
        
        // Wait a bit more for the panel to be fully set up
        setTimeout(async () => {
          console.log('🔍 Checking for completed summaries after panel setup...');
          // Check for completed summaries first (in case they were generated while tab was inactive)
          await checkForCompletedSummaries();
          
          // Then check for cached summary
          await checkForCachedSummary(videoInfo.videoId);
        }, 500);
      }
    }, 1000);
  } else {
    // If not on a video page, clear cached info and remove panel
    sessionStorage.removeItem('youtubeSummarizer_videoInfo');
    if (summaryPanel) {
      summaryPanel.remove();
      summaryPanel = null;
    }
    currentVideoId = null;
    stopSummaryChecking(); // Stop any ongoing checking
    stopActivePageChecking(); // Stop any ongoing checking
    stopContinuousMonitoring(); // Stop any ongoing checking
  }
}

// Check for cached summary
async function checkForCachedSummary(videoId) {
  try {
    const result = await chrome.storage.local.get([`summaryResult_${videoId}`]);
    const cachedResult = result[`summaryResult_${videoId}`];
    
    if (cachedResult && cachedResult.summary) {
      console.log('📋 Found cached summary, displaying...');
      
      // Ensure processing state is reset to allow display
      isProcessing = false;
      
      // Always extract fresh video info to get the current video title
      const currentVideoInfo = extractVideoInfo();
      if (currentVideoInfo && currentVideoInfo.videoId === videoId) {
        // Use the fresh title from the current page
        displayResult(cachedResult.summary, true, currentVideoInfo.title);
      } else {
        // Fallback to stored title if extraction fails
        displayResult(cachedResult.summary, true);
      }
      
      // Show status section
      const statusDiv = summaryPanel.querySelector('#youtube-summarizer-status');
      if (statusDiv) {
        statusDiv.style.display = 'block';
      }
      
      // Update progress bar
      const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
      if (progressBar) {
        progressBar.value = 100;
      }
      
      // Update progress text
      const progressText = summaryPanel.querySelector('#youtube-summarizer-progress-text');
      if (progressText) {
        progressText.textContent = '📋 Loaded from cache';
      }
      
      console.log('✅ Cached summary displayed successfully with fresh title');
    }
  } catch (error) {
    console.error('❌ Error checking cached summary:', error);
  }
}

// Function to clear the summary display
function clearSummaryDisplay() {
  if (!summaryPanel) return;
  
  // Reset processing state to allow new summaries to be displayed
  isProcessing = false;
  
  const resultDiv = summaryPanel.querySelector('#youtube-summarizer-result');
  const statusDiv = summaryPanel.querySelector('#youtube-summarizer-status');
  const progressBar = summaryPanel.querySelector('#youtube-summarizer-progress');
  const progressText = summaryPanel.querySelector('#youtube-summarizer-progress-text');
  
  if (resultDiv) {
    resultDiv.innerHTML = '';
  }
  if (statusDiv) {
    statusDiv.style.display = 'none';
  }
  if (progressBar) {
    progressBar.value = 0;
  }
  if (progressText) {
    progressText.textContent = 'Initializing...';
  }
  
  console.log('🧹 Summary display cleared and processing state reset');
}

// Run extraction when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoExtractVideoInfo);
} else {
  autoExtractVideoInfo();
}

// Also run when URL changes (for SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('🔄 URL changed, re-extracting video info...');
    setTimeout(async () => {
      await autoExtractVideoInfo();
    }, 1000); // Wait for page to load
  }
}).observe(document, {subtree: true, childList: true});

// Listen for YouTube's navigation events
window.addEventListener('yt-navigate-finish', function() {
  console.log('🔄 YouTube navigation finished, re-extracting video info...');
  setTimeout(async () => {
    await autoExtractVideoInfo();
  }, 500);
});

// Cleanup function to stop intervals and clear resources
function cleanup() {
  stopSummaryChecking();
  stopActivePageChecking();
  stopContinuousMonitoring();
  
  // Clear any existing summary display
  clearSummaryDisplay();
  
  currentVideoId = null;
  isProcessing = false;
  console.log('🧹 Content script cleanup completed');
}

// Clean up when page is about to unload
window.addEventListener('beforeunload', cleanup);

// Clean up when navigating away from video pages
window.addEventListener('pagehide', cleanup);

console.log('✅ YouTube Summarizer content script initialization complete');
