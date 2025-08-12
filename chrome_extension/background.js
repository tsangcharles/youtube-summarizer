// Background service worker for YouTube Summarizer extension

// Configuration
const API_BASE_URL = 'http://localhost:5000'; // Your Python backend server

// In-memory storage for active tasks and cache
let activeTasks = new Map(); // videoId -> { status, progress, startTime, summary }
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
    console.log('🔍 getTaskStatus requested for video:', request.videoId);
    const status = getVideoStatus(request.videoId);
    console.log('🔍 getTaskStatus response for video:', request.videoId, 'Status:', status);
    sendResponse(status);
  } else if (request.action === 'getCachedSummary') {
    // Get cached summary if available
    const cached = summaryCache.get(request.videoId);
    console.log('🔍 getCachedSummary for:', request.videoId, 'Result:', cached ? 'FOUND' : 'NOT FOUND');
    console.log('🔍 Current cache size:', summaryCache.size);
    console.log('🔍 Cache keys:', Array.from(summaryCache.keys()));
    sendResponse(cached || null);
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
      timestamp: cached.timestamp,
      title: cached.title
    };
  }

  // Check active tasks
  const activeTask = activeTasks.get(videoId);
  console.log('🔍 Active task lookup result:', activeTask ? 'FOUND' : 'NOT FOUND');
  console.log('🔍 Active tasks map size:', activeTasks.size);
  console.log('🔍 Active tasks keys:', Array.from(activeTasks.keys()));
  
  if (activeTask) {
    // Provide more detailed information about ongoing tasks
    let statusMessage = '🔄 Processing in background...';
    if (activeTask.status === 'downloading') statusMessage = '📥 Downloading audio...';
    else if (activeTask.status === 'transcribing') statusMessage = '🎵 Transcribing audio...';
    else if (activeTask.status === 'summarizing') statusMessage = '🤖 Summarizing with Gemini AI...';
    else if (activeTask.status === 'completed') statusMessage = '✅ Summarization completed!';
    
    console.log('🔍 Returning active task status:', {
      status: activeTask.status,
      progress: activeTask.progress,
      statusMessage: statusMessage,
      isActive: activeTask.status !== 'completed'
    });
    
    return {
      status: activeTask.status,
      progress: activeTask.progress,
      startTime: activeTask.startTime,
      statusMessage: statusMessage,
      summary: activeTask.summary, // Include summary if completed
      cached: false,
      isActive: activeTask.status !== 'completed'
    };
  }

  console.log('🔍 No active task or cache found, returning idle status');
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
      console.log('📋 Returning cached result for video:', videoId);
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
    
    // Update status during processing with more realistic timing
    setTimeout(() => {
      if (activeTasks.has(videoId)) {
        activeTasks.set(videoId, { ...activeTasks.get(videoId), status: 'transcribing', progress: 60 });
        broadcastStatusUpdate(videoId, '🎵 Transcribing audio...');
      }
    }, 2000);
    
    setTimeout(() => {
      if (activeTasks.has(videoId)) {
        activeTasks.set(videoId, { ...activeTasks.get(videoId), status: 'summarizing', progress: 85 });
        broadcastStatusUpdate(videoId, '🤖 Summarizing with Gemini AI...');
      }
    }, 5000);

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
      console.log('📥 Server response received:', result);
      console.log('📥 Summary length:', result.summary ? result.summary.length : 'NO SUMMARY');
      
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

      // Mark task as completed but keep it briefly for popup detection
      activeTasks.set(videoId, {
        status: 'completed',
        progress: 100,
        startTime: activeTasks.get(videoId)?.startTime || Date.now(),
        summary: result.summary
      });

      // Log completion for history
      await addStatusToLog(videoId, '✅ Summarization successful!');
      
      // Store the result in multiple storage locations for reliability
      await storeResultInMultipleLocations(videoId, result.summary);
      
      // Notify completion - send the summary
      broadcastSummaryReady(videoId, result.summary);
      
      // Remove from active tasks after a brief delay to allow popup detection
      setTimeout(() => {
        activeTasks.delete(videoId);
        console.log('🗑️ Removed completed task for video:', videoId);
      }, 2000);

    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error');
    }

  } catch (error) {
    console.error('❌ Error in background processing:', error);
    
    // Remove from active tasks
    activeTasks.delete(videoId);

    // Provide more specific error messages and broadcast
    let errorMessage = 'Failed to generate summary';
    if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Connection failed. Please try again.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Gemini API connection failed. Please check your .env file.';
    } else if (error.message.includes('403')) {
      errorMessage = 'YouTube temporarily blocked the request. Please try again.';
    } else {
      errorMessage = `Processing failed: ${error.message}`;
    }

    // Log error and broadcast it
    broadcastStatusUpdate(videoId, `❌ ${errorMessage}`);
    
    // Also store the error in storage so popup can retrieve it
    await storeErrorInStorage(videoId, errorMessage);
    
    // Try to send error status to any open popups
    try {
      chrome.runtime.sendMessage({
        action: 'statusUpdate',
        videoId: videoId,
        status: `❌ ${errorMessage}`
      }).catch((error) => {
        console.log('❌ Error broadcasting error status:', error);
      });
    } catch (error) {
      console.log('❌ Error broadcasting error status:', error);
    }
  }
}

// Store error in storage for popup retrieval
async function storeErrorInStorage(videoId, errorMessage) {
  try {
    await chrome.storage.local.set({
      [`errorResult_${videoId}`]: {
        error: errorMessage,
        timestamp: Date.now(),
        videoId: videoId
      }
    });
    console.log('💾 Stored error result in storage for video:', videoId);
  } catch (error) {
    console.error('❌ Error storing error result:', error);
  }
}

// Store result in multiple locations for reliability
async function storeResultInMultipleLocations(videoId, summary) {
  try {
    // 1. Store in Chrome storage (primary location)
    await chrome.storage.local.set({
      [`summaryResult_${videoId}`]: {
        summary: summary,
        timestamp: Date.now(),
        videoId: videoId
      }
    });
    console.log('💾 Stored summary result in Chrome storage for video:', videoId);
    
    // 2. Store with a timestamp for cleanup purposes
    await chrome.storage.local.set({
      [`summaryTimestamp_${videoId}`]: Date.now()
    });
    
    console.log('💾 Summary stored in all available locations for video:', videoId);
    
  } catch (error) {
    console.error('❌ Error storing result in multiple locations:', error);
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
  try {
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      videoId: videoId,
      status: status
    }).catch((error) => {
      console.log('❌ Error broadcasting status via runtime (popup may not be open):', error);
    });
  } catch (error) {
    console.log('❌ Error broadcasting status via runtime:', error);
  }
  
  // Also try to send message to all tabs that might be on this video
  try {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes(`youtube.com/watch?v=${videoId}`)) {
          console.log('📤 Sending status update to tab:', tab.id, status);
          chrome.tabs.sendMessage(tab.id, {
            action: 'statusUpdate',
            videoId: videoId,
            status: status
          }).catch((error) => {
            console.log('❌ Error sending status update to tab:', tab.id, error);
          });
        }
      });
    });
  } catch (error) {
    console.log('❌ Error broadcasting status to tabs:', error);
  }
}

function broadcastSummaryReady(videoId, summary) {
  console.log('📤 Broadcasting summary ready for video:', videoId);
  console.log('📤 Summary content:', summary);
  console.log('📤 Summary length:', summary ? summary.length : 'NO SUMMARY');
  
  // Store the result in storage for the popup to find (this is the most reliable method)
  chrome.storage.local.set({
    [`summaryResult_${videoId}`]: {
      summary: summary,
      timestamp: Date.now(),
      videoId: videoId
    }
  }).then(() => {
    console.log('💾 Successfully stored summary result in storage for video:', videoId);
  }).catch((error) => {
    console.error('❌ Failed to store summary result:', error);
  });
  
  // Also store in localStorage as a backup
  try {
    localStorage.setItem(`summary_${videoId}`, summary);
    localStorage.setItem(`summary_timestamp_${videoId}`, Date.now().toString());
    console.log('💾 Also stored summary in localStorage as backup');
  } catch (error) {
    console.error('❌ Failed to store in localStorage:', error);
  }
  
  // Try to send summary to any open popups via runtime message
  try {
    console.log('📤 Sending summary via runtime message');
    chrome.runtime.sendMessage({
      action: 'summaryReady',
      videoId: videoId,
      summary: summary
    }).then(() => {
      console.log('✅ Runtime message sent successfully');
    }).catch((error) => {
      console.log('❌ Error broadcasting summary via runtime (popup may not be open):', error);
    });
  } catch (error) {
    console.log('❌ Error broadcasting summary via runtime:', error);
  }
  
  // Also try to send a status update to ensure the popup knows something happened
  try {
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      videoId: videoId,
      status: '✅ Summarization successful!'
    }).catch((error) => {
      console.log('❌ Error broadcasting status update:', error);
    });
  } catch (error) {
    console.log('❌ Error broadcasting status update:', error);
  }
  
  // Try to send message to all tabs that might be on this video
  try {
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes(`youtube.com/watch?v=${videoId}`)) {
          console.log('📤 Sending summary to tab:', tab.id);
          chrome.tabs.sendMessage(tab.id, {
            action: 'summaryReady',
            videoId: videoId,
            summary: summary
          }).catch((error) => {
            console.log('❌ Error sending message to tab:', tab.id, error);
          });
        }
      });
    });
  } catch (error) {
    console.log('❌ Error broadcasting to tabs:', error);
  }
}

// Periodic cleanup and maintenance
setInterval(async () => {
  try {
    // Clean up old error results (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const storageKeys = await chrome.storage.local.get(null);
    
    for (const [key, value] of Object.entries(storageKeys)) {
      if (key.startsWith('errorResult_') && value.timestamp < oneHourAgo) {
        await chrome.storage.local.remove([key]);
        console.log('🧹 Cleaned up old error result:', key);
      }
    }
    
    // Clean up old summary results (older than 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const [key, value] of Object.entries(storageKeys)) {
      if (key.startsWith('summaryResult_') && value.timestamp < oneDayAgo) {
        await chrome.storage.local.remove([key]);
        console.log('🧹 Cleaned up old summary result:', key);
      }
    }
    
    // Save cache periodically
    await saveCache();
    
  } catch (error) {
    console.error('❌ Error in periodic cleanup:', error);
  }
}, 300000); // Run every 5 minutes

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
