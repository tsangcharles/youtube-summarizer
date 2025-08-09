// Popup script for YouTube Summarizer extension

document.addEventListener('DOMContentLoaded', function() {
    const summarizeBtn = document.getElementById('summarizeBtn');
    const statusDiv = document.getElementById('status');
    const summaryResultDiv = document.getElementById('summaryResult');
    const videoInfoDiv = document.getElementById('videoInfo');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Get video info from content script with retry logic
    function getVideoInfoWithRetry(maxRetries = 5) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            
            function attempt() {
                attempts++;
                console.log(`🔍 Attempt ${attempts} to get video info...`);
                
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (!tabs[0]) {
                        reject('No active tab found');
                        return;
                    }
                    
                    // Check if we're on a YouTube video page first
                    const url = tabs[0].url;
                    if (!url || !url.includes('youtube.com/watch')) {
                        reject('Not on a YouTube video page');
                        return;
                    }
                    
                    chrome.tabs.sendMessage(tabs[0].id, {action: 'getVideoInfo'}, function(response) {
                        console.log('📨 Response from content script:', response);
                        
                        if (chrome.runtime.lastError) {
                            console.log('❌ Runtime error:', chrome.runtime.lastError);
                            if (attempts < maxRetries) {
                                setTimeout(attempt, 500);
                            } else {
                                reject('Content script not responding. Please refresh the page.');
                            }
                            return;
                        }
                        
                        if (response && response.success && response.videoInfo) {
                            resolve(response.videoInfo);
                        } else if (response && !response.success) {
                            if (attempts < maxRetries) {
                                console.log(`⏳ Retrying in 0.5 seconds... (${attempts}/${maxRetries})`);
                                setTimeout(attempt, 500);
                            } else {
                                reject(response.error || 'Could not get video information');
                            }
                        } else {
                            if (attempts < maxRetries) {
                                console.log(`⏳ No response, retrying in 0.5 seconds... (${attempts}/${maxRetries})`);
                                setTimeout(attempt, 500);
                            } else {
                                reject('Could not get video information. Please refresh the page.');
                            }
                        }
                    });
                });
            }
            
            attempt();
        });
    }

    // Initialize popup
    async function initializePopup() {
        try {
            // Try to get video info from current tab URL first (fastest method)
            const videoInfo = await getVideoInfoFromURL();
            
            if (videoInfo && videoInfo.videoId) {
                // Check if this is a different video than last time
                const lastVideoId = localStorage.getItem('lastVideoId');
                if (lastVideoId && lastVideoId !== videoInfo.videoId) {
                    // Clear any previous results if video changed
                    summaryResultDiv.innerHTML = '';
                }
                
                displayVideoInfo(videoInfo);
            } else {
                throw new Error('Not on a YouTube video page');
            }
        } catch (error) {
            console.error('❌ Error initializing popup:', error);
            displayError(error.message);
        }
    }

    // Get video info directly from URL (faster, more reliable)
    async function getVideoInfoFromURL() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (!tabs[0]) {
                    reject(new Error('No active tab found'));
                    return;
                }
                
                const url = tabs[0].url;
                const title = tabs[0].title;
                
                console.log('Tab URL:', url);
                console.log('Tab Title:', title);
                
                // Check if we're on a YouTube video page
                if (!url || !url.includes('youtube.com/watch')) {
                    reject(new Error('Not on a YouTube video page'));
                    return;
                }
                
                // Extract video ID from URL
                const urlParams = new URL(url).searchParams;
                const videoId = urlParams.get('v');
                
                if (!videoId) {
                    reject(new Error('No video ID found in URL'));
                    return;
                }
                
                // Clean up the title
                let cleanTitle = title.replace(' - YouTube', '').trim();
                if (!cleanTitle || cleanTitle === 'YouTube') {
                    cleanTitle = `YouTube Video ${videoId}`;
                }
                
                const videoInfo = {
                    videoId: videoId,
                    title: cleanTitle,
                    url: url
                };
                
                console.log('✅ Video info from URL:', videoInfo);
                resolve(videoInfo);
            });
        });
    }

    // Listen for status updates from background script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'updateStatus') {
            updateProgress(request.status);
        }
    });

    // Handle summarize button click
    summarizeBtn.addEventListener('click', function() {
        startSummarization();
    });

    function displayVideoInfo(videoInfo) {
        videoInfoDiv.innerHTML = `
            <div class="video-info">
                <h3>📺 ${videoInfo.title}</h3>
            </div>
        `;
        summarizeBtn.disabled = false;
        summarizeBtn.innerHTML = '🚀 Generate Summary';
        
        // Store current video ID to detect changes
        localStorage.setItem('lastVideoId', videoInfo.videoId);
    }

    async function startSummarization() {
        // Reset UI
        summarizeBtn.disabled = true;
        summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
        summaryResultDiv.innerHTML = ''; // Clear previous summary
        statusDiv.style.display = 'block';
        progressBar.style.display = 'block';
        
        try {
            // Get video info and send to background script
            const videoInfo = await getVideoInfoFromURL();
            
            // Start the processing with status updates  
            updateProgress('📥 Downloading audio...');
            
            chrome.runtime.sendMessage({
                action: 'summarizeVideo',
                videoInfo: videoInfo
            }, function(result) {
                if (result && result.success) {
                    updateProgress('✅ Summarization successful!');
                    setTimeout(() => {
                        displayResult(result.summary);
                    }, 1000); // Show success message briefly before showing result
                } else {
                    displayError(result ? result.error : 'Unknown error occurred');
                    updateProgress('❌ Failed to generate summary');
                }
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
            });
            
            // Simulate realistic processing steps with timing
            setTimeout(() => updateProgress('🎵 Transcribing audio...'), 3000);
            setTimeout(() => updateProgress('📝 Processing transcript...'), 10000);
            setTimeout(() => updateProgress('🤖 Summarizing with Llama AI...'), 12000);
        } catch (error) {
            displayError(error);
            updateProgress('❌ Failed to process video');
            summarizeBtn.disabled = false;
            summarizeBtn.innerHTML = '🚀 Generate Summary';
        }
    }

    function updateProgress(status) {
        progressText.textContent = status;
        
        // Update progress bar based on status
        let progress = 0;
        if (status.includes('Downloading audio')) progress = 25;
        else if (status.includes('Transcribing audio')) progress = 50;
        else if (status.includes('Processing transcript')) progress = 70;
        else if (status.includes('Summarizing with Llama')) progress = 85;
        else if (status.includes('Summarization successful')) progress = 100;
        else if (status.includes('Failed') || status.includes('Error')) progress = 0;
        
        progressBar.value = progress;
        
        // Add status to log
        const timestamp = new Date().toLocaleTimeString();
        const statusLog = document.getElementById('statusLog');
        if (statusLog) {
            statusLog.innerHTML += `<div class="status-entry">[${timestamp}] ${status}</div>`;
            statusLog.scrollTop = statusLog.scrollHeight;
        }
    }

    function displayResult(summary) {
        summaryResultDiv.innerHTML = `
            <div class="summary-container">
                <h3>📋 Summary</h3>
                <div class="summary-content">
                    ${summary.replace(/\n/g, '<br>')}
                </div>
                <div class="summary-actions">
                    <button id="copyBtn" class="summary-action-btn">📋 Copy</button>
                    <button id="saveBtn" class="summary-action-btn">💾 Save</button>
                </div>
            </div>
        `;
        
        // Add event listeners for copy and save buttons
        document.getElementById('copyBtn').addEventListener('click', function() {
            navigator.clipboard.writeText(summary).then(function() {
                this.textContent = '✅ Copied!';
                setTimeout(() => {
                    this.textContent = '📋 Copy';
                }, 2000);
            }.bind(this));
        });
        
        document.getElementById('saveBtn').addEventListener('click', function() {
            const blob = new Blob([summary], {type: 'text/plain'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'youtube_summary.txt';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    function displayError(error) {
        summaryResultDiv.innerHTML = `
            <div class="error-container">
                <h3>❌ Error</h3>
                <p>${error}</p>
                <div class="error-help">
                    <p><strong>Common solutions:</strong></p>
                    <ul>
                        <li>Make sure you're on a YouTube video page</li>
                        <li>Refresh the page and try again</li>
                        <li>Make sure the application is running</li>
                        <li>Make sure your Llama server is running on localhost:11434</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Initialize the popup
    initializePopup();
});
