// Background service worker for YouTube Summarizer extension

// Configuration
const API_BASE_URL = 'http://localhost:5000'; // Your Python backend server

// In-memory storage for active tasks and cache
let activeTasks = new Map(); // videoId -> { status, progress, startTime }
let summaryCache = new Map(); // videoId -> { summary, timestamp, title }

// Initialize cache from persistent storage on startup
async function initializeCache() {
  try {
    const result = await chrome.storage.local.get(['summaryCache']);
    if (result.summaryCache) {
      summaryCache = new Map(Object.entries(result.summaryCache));
      console.log('📋 Loaded', summaryCache.size, 'cached summaries from storage');
      console.log('📋 Cache keys:', Array.from(summaryCache.keys()));
    } else {
      console.log('📋 No cache found in storage, starting fresh');
    }
  } catch (error) {
    console.error('Failed to load cache from storage:', error);
  }
}

// Save cache to persistent storage
async function saveCache() {
  try {
    // Clean up old entries (older than 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    for (const [videoId, cacheEntry] of summaryCache.entries()) {
      if (cacheEntry.timestamp < sevenDaysAgo) {
        summaryCache.delete(videoId);
      }
    }
    
    // Limit cache size to 100 entries (keep most recent)
    if (summaryCache.size > 100) {
      const entries = Array.from(summaryCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp); // Sort by timestamp desc
      summaryCache.clear();
      entries.slice(0, 100).forEach(([key, value]) => {
        summaryCache.set(key, value);
      });
    }
    
    const cacheObject = Object.fromEntries(summaryCache);
    await chrome.storage.local.set({ summaryCache: cacheObject });
  } catch (error) {
    console.error('Failed to save cache to storage:', error);
  }
}

// Initialize on startup
initializeCache();

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'summarizeVideo') {
    handleVideoSummarization(request.videoInfo, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getTaskStatus') {
    // Check if there's an active task or cached result for this video
    const status = getVideoStatus(request.videoId);
    sendResponse(status);
  } else if (request.action === 'getCachedSummary') {
    // Get cached summary if available
    const cached = summaryCache.get(request.videoId);
    console.log('🔍 getCachedSummary for:', request.videoId, 'Result:', cached ? 'FOUND' : 'NOT FOUND');
    console.log('🔍 Current cache size:', summaryCache.size);
    console.log('🔍 Cache keys:', Array.from(summaryCache.keys()));
    sendResponse(cached || null);
  } else if (request.action === 'debugCache') {
    // Debug cache contents
    const cacheContents = Object.fromEntries(summaryCache);
    console.log('🔍 Debug cache contents:', cacheContents);
    sendResponse({ cacheSize: summaryCache.size, cacheContents });
  }
});

function getVideoStatus(videoId) {
  console.log('🔍 Getting status for video:', videoId);
  
  // Check cache first
  const cached = summaryCache.get(videoId);
  console.log('🔍 Cache lookup result:', cached ? 'FOUND' : 'NOT FOUND');
  
  if (cached) {
    return {
      status: 'completed',
      summary: cached.summary,
      cached: true,
      timestamp: cached.timestamp
    };
  }

  // Check active tasks
  const activeTask = activeTasks.get(videoId);
  console.log('🔍 Active task lookup result:', activeTask ? 'FOUND' : 'NOT FOUND');
  
  if (activeTask) {
    return {
      status: activeTask.status,
      progress: activeTask.progress,
      startTime: activeTask.startTime,
      cached: false
    };
  }

  return { status: 'idle', cached: false };
}

async function handleVideoSummarization(videoInfo, sendResponse) {
  try {
    // Check if we have the required info
    if (!videoInfo || !videoInfo.videoId) {
      sendResponse({
        success: false,
        error: 'Invalid video information'
      });
      return;
    }

    const videoId = videoInfo.videoId;

    // Check if we already have a cached result
    const cached = summaryCache.get(videoId);
    if (cached) {
      sendResponse({
        success: true,
        summary: cached.summary,
        cached: true
      });
      return;
    }

    // Check if task is already running
    if (activeTasks.has(videoId)) {
      sendResponse({
        success: false,
        error: 'Summarization already in progress for this video'
      });
      return;
    }

    // Start background processing
    processVideoInBackground(videoInfo);
    
    // Immediately respond that processing has started
    sendResponse({
      success: true,
      processing: true,
      message: 'Summarization started in background'
    });

  } catch (error) {
    sendResponse({
      success: false,
      error: error.message || 'Failed to start summarization'
    });
  }
}

async function processVideoInBackground(videoInfo) {
  const videoId = videoInfo.videoId;
  
  try {
    // Mark task as active
    activeTasks.set(videoId, {
      status: 'downloading',
      progress: 20,
      startTime: Date.now()
    });

    // Notify any open popups about status change
    broadcastStatusUpdate(videoId, '📥 Downloading audio...');
    
    // Update status during processing
    setTimeout(() => {
      activeTasks.set(videoId, { ...activeTasks.get(videoId), status: 'transcribing', progress: 60 });
      broadcastStatusUpdate(videoId, '🎵 Transcribing audio...');
    }, 3000);
    
    setTimeout(() => {
      activeTasks.set(videoId, { ...activeTasks.get(videoId), status: 'summarizing', progress: 85 });
      broadcastStatusUpdate(videoId, '🤖 Summarizing with Qwen3 AI...');
    }, 8000);

    // Use sync endpoint for processing
    const response = await fetch(`${API_BASE_URL}/summarize-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        video_title: videoInfo.title
      })
    });

    if (response.ok) {
      const result = await response.json();
      
      // Cache the result
      const cacheEntry = {
        summary: result.summary,
        timestamp: Date.now(),
        title: videoInfo.title
      };
      
      summaryCache.set(videoId, cacheEntry);
      console.log('💾 Cached summary for video:', videoId, 'Cache size:', summaryCache.size);
      
      // Save to persistent storage
      await saveCache();
      console.log('💾 Saved cache to persistent storage');

      // Remove from active tasks
      activeTasks.delete(videoId);

      // Log completion for history (but don't broadcast as current status)
      await addStatusToLog(videoId, '✅ Summarization successful!');
      
      // Notify completion - send the summary
      broadcastSummaryReady(videoId, result.summary);

    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error');
    }

  } catch (error) {
    // Remove from active tasks
    activeTasks.delete(videoId);

    // Provide more specific error messages and broadcast
    let errorMessage = 'Failed to generate summary';
    if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Connection failed. Please try again.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Ollama connection failed. Please check your .env file.';
    } else if (error.message.includes('403')) {
      errorMessage = 'YouTube temporarily blocked the request. Please try again.';
    } else {
      errorMessage = `Processing failed: ${error.message}`;
    }

    // Log error and broadcast it
    broadcastStatusUpdate(videoId, `❌ ${errorMessage}`);
  }
}

async function addStatusToLog(videoId, status) {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const logKey = `statusLog_${videoId}`;
    
    // Get existing logs from storage
    const result = await chrome.storage.local.get([logKey]);
    let logs = result[logKey] || [];
    
    // Add new log entry
    logs.push({
      timestamp: timestamp,
      status: status,
      time: Date.now()
    });
    
    // Keep only last 20 entries per video
    if (logs.length > 20) {
      logs = logs.slice(-20);
    }
    
    // Save back to storage
    await chrome.storage.local.set({ [logKey]: logs });
    console.log('📝 Logged status for video:', videoId, 'Status:', status);
  } catch (error) {
    console.error('Failed to log status:', error);
  }
}

function broadcastStatusUpdate(videoId, status) {
  // Log the status regardless of whether popup is open
  addStatusToLog(videoId, status);
  
  // Try to send status update to any open popups
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    videoId: videoId,
    status: status
  }).catch(() => {
    // Ignore errors - popup might not be open
  });
}

function broadcastSummaryReady(videoId, summary) {
  // Try to send summary to any open popups
  chrome.runtime.sendMessage({
    action: 'summaryReady',
    videoId: videoId,
    summary: summary
  }).catch(() => {
    // Ignore errors - popup might not be open
  });
}

function updateStatus(status) {
  // Legacy function - kept for compatibility
  chrome.runtime.sendMessage({
    action: 'updateStatus',
    status: status
  }).catch(() => {
    // Ignore errors - popup might not be open
  });
}

// Handle extension startup
chrome.runtime.onStartup.addListener(function() {
  console.log('YouTube Summarizer extension started');
  // Clear any stale active tasks on restart
  activeTasks.clear();
});

// Handle extension install
chrome.runtime.onInstalled.addListener(function() {
  console.log('YouTube Summarizer extension installed/updated');
});
