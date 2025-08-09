// Background service worker for YouTube Summarizer extension

// Configuration
const API_BASE_URL = 'http://localhost:5000'; // Your Python backend server

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'summarizeVideo') {
    handleVideoSummarization(request.videoInfo, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

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

    // Use sync endpoint for processing
    try {
      const response = await fetch(`${API_BASE_URL}/summarize-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
          video_title: videoInfo.title
        })
      });

      if (response.ok) {
        const result = await response.json();
        sendResponse({
          success: true,
          summary: result.summary
        });
        return;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server error');
      }
    } catch (error) {
      // Provide more specific error messages
      if (error.message.includes('Failed to fetch')) {
        updateStatus('❌ Connection failed');
        throw new Error('Connection failed. Please try again.');
      } else if (error.message.includes('API key')) {
        updateStatus('❌ Invalid API key. Check your .env file.');
        throw new Error('Ollama connection failed. Please check your .env file.');
      } else if (error.message.includes('403')) {
        updateStatus('❌ YouTube access denied. Retrying...');
        throw new Error('YouTube temporarily blocked the request. Please try again.');
      } else {
        updateStatus('❌ Processing failed');
        throw new Error(`Processing failed: ${error.message}`);
      }
    }

  } catch (error) {
    updateStatus('❌ Error occurred');
    sendResponse({
      success: false,
      error: error.message || 'Failed to generate summary'
    });
  }
}

function updateStatus(status) {
  // Send status update to popup
  chrome.runtime.sendMessage({
    action: 'updateStatus',
    status: status
  });
}

// Handle extension startup
chrome.runtime.onStartup.addListener(function() {
  console.log('YouTube Summarizer extension started');
});
