// Content script for YouTube pages

console.log('🎥 YouTube Summarizer content script loaded');

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
    }
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
      }
    }, 1000);
  } else {
    // If not on a video page, clear cached info
    sessionStorage.removeItem('youtubeSummarizer_videoInfo');
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
