// Content script for YouTube pages

console.log('🎥 YouTube Summarizer content script loaded');

// Global variables
let summaryPanel = null;
let currentVideoId = null;
let isProcessing = false;

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
        <button id="youtube-summarizer-toggle" class="youtube-summarizer-toggle">−</button>
      </div>
      <div class="youtube-summarizer-content">
        <div id="youtube-summarizer-video-info" class="youtube-summarizer-video-info">
          <p>Loading video info...</p>
        </div>
        <button id="youtube-summarizer-btn" class="youtube-summarizer-btn" disabled>
          <span class="youtube-summarizer-spinner"></span>
          Loading...
        </button>
        <div id="youtube-summarizer-status" class="youtube-summarizer-status" style="display: none;">
          <div id="youtube-summarizer-result"></div>
          <progress id="youtube-summarizer-progress" value="0" max="100"></progress>
          <p id="youtube-summarizer-progress-text">Initializing...</p>
          <div id="youtube-summarizer-log"></div>
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
    
    .youtube-summarizer-video-info {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .youtube-summarizer-video-info h4 {
      margin: 0 0 8px 0;
      color: white;
      font-size: 14px;
      font-weight: 500;
    }
    
    .youtube-summarizer-video-info p {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      font-family: monospace;
    }
    
    .youtube-summarizer-btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(45deg, #ff0000, #cc0000);
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
      box-shadow: 0 4px 12px rgba(255, 0, 0, 0.3);
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
      background: rgba(0, 255, 0, 0.1);
      border: 1px solid rgba(0, 255, 0, 0.3);
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
      background: rgba(0, 255, 0, 0.2);
      color: white;
      border: 1px solid rgba(0, 255, 0, 0.3);
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s ease;
    }
    
    .youtube-summarizer-action-btn:hover {
      background: rgba(0, 255, 0, 0.3);
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
    
    #youtube-summarizer-log {
      max-height: 80px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      padding: 8px;
      font-size: 10px;
      font-family: monospace;
      color: rgba(255, 255, 255, 0.7);
    }
    
    .youtube-summarizer-log-entry {
      margin: 2px 0;
      padding: 2px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .youtube-summarizer-log-entry:last-child {
      border-bottom: none;
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
  
  const videoInfoDiv = summaryPanel.querySelector('#youtube-summarizer-video-info');
  if (videoInfoDiv) {
    videoInfoDiv.innerHTML = `
      <h4>📺 ${videoInfo.title}</h4>
      <p>ID: ${videoInfo.videoId}</p>
    `;
  }
  
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
    } else {
      console.error('❌ Failed to start summarization:', response?.error);
      displayError(response?.error || 'Failed to start summarization');
      isProcessing = false;
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
  
  if (!skipLogging) {
    addStatusToLog(status);
  }
}

// Function to add status to log
function addStatusToLog(status) {
  if (!summaryPanel) return;
  
  const logDiv = summaryPanel.querySelector('#youtube-summarizer-log');
  if (!logDiv) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = 'youtube-summarizer-log-entry';
  logEntry.textContent = `[${timestamp}] ${status}`;
  
  logDiv.appendChild(logEntry);
  logDiv.scrollTop = logDiv.scrollHeight;
  
  // Keep only last 10 entries
  while (logDiv.children.length > 10) {
    logDiv.removeChild(logDiv.firstChild);
  }
}

// Function to display results
function displayResult(summary, cached = false) {
  if (!summaryPanel) return;
  
  isProcessing = false;
  
  const resultDiv = summaryPanel.querySelector('#youtube-summarizer-result');
  const summarizeBtn = summaryPanel.querySelector('#youtube-summarizer-btn');
  
  if (resultDiv) {
    // Format the summary with proper line breaks and paragraphs
    const formattedSummary = summary
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => `<p>${line.trim()}</p>`)
      .join('');
    
    resultDiv.innerHTML = `
      <div class="youtube-summarizer-summary">
        <h4>📋 Summary ${cached ? '<small style="opacity: 0.7;">(cached)</small>' : ''}</h4>
        <div class="youtube-summarizer-summary-content">
          ${formattedSummary}
        </div>
        <div class="youtube-summarizer-actions">
          <button class="youtube-summarizer-action-btn" onclick="navigator.clipboard.writeText('${summary.replace(/'/g, "\\'")}').then(() => { this.textContent = '✅ Copied!'; setTimeout(() => { this.textContent = '📋 Copy'; }, 2000); })">📋 Copy</button>
          <button class="youtube-summarizer-action-btn" onclick="const blob = new Blob(['${summary.replace(/'/g, "\\'")}'], {type: 'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'youtube_summary.txt'; a.click(); URL.revokeObjectURL(url);">💾 Save</button>
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
}

// Function to display errors
function displayError(error) {
  if (!summaryPanel) return;
  
  isProcessing = false;
  
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
    
    // Wait a bit for the page to fully load
    setTimeout(() => {
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
        
        // Check for cached summary
        checkForCachedSummary(videoInfo.videoId);
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
  }
}

// Check for cached summary
async function checkForCachedSummary(videoId) {
  try {
    const result = await chrome.storage.local.get([`summaryResult_${videoId}`]);
    const cachedResult = result[`summaryResult_${videoId}`];
    
    if (cachedResult && cachedResult.summary) {
      console.log('📋 Found cached summary, displaying...');
      displayResult(cachedResult.summary, true);
      
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
    }
  } catch (error) {
    console.error('❌ Error checking cached summary:', error);
  }
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
    setTimeout(autoExtractVideoInfo, 1000); // Wait for page to load
  }
}).observe(document, {subtree: true, childList: true});

// Listen for YouTube's navigation events
window.addEventListener('yt-navigate-finish', function() {
  console.log('🔄 YouTube navigation finished, re-extracting video info...');
  setTimeout(autoExtractVideoInfo, 500);
});

console.log('✅ YouTube Summarizer content script initialization complete');
