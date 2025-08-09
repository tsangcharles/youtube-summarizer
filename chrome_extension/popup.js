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
                // Store current video ID
                localStorage.setItem('currentVideoId', videoInfo.videoId);
                
                // Check if this is a different video than last time
                const lastVideoId = localStorage.getItem('lastVideoId');
                if (lastVideoId && lastVideoId !== videoInfo.videoId) {
                    // Clear any previous results if video changed
                    summaryResultDiv.innerHTML = '';
                }
                
                displayVideoInfo(videoInfo);
                
                // Check for cached summary or active task
                await checkVideoStatus(videoInfo.videoId);
                
            } else {
                throw new Error('Not on a YouTube video page');
            }
        } catch (error) {
            console.error('❌ Error initializing popup:', error);
            displayError(error.message);
        }
    }
    
    async function checkVideoStatus(videoId) {
        try {
            // Check if there's a cached summary
            console.log('🔍 Checking cache for video:', videoId);
            const cached = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getCachedSummary',
                    videoId: videoId
                }, (response) => {
                    console.log('🔍 Cache response:', response);
                    resolve(response);
                });
            });
            
            if (cached && cached.summary) {
                console.log('📋 Found cached summary for video:', videoId);
                displayResult(cached.summary, true);
                
                // Show status section with cached results
                statusDiv.style.display = 'block';
                progressBar.style.display = 'block';
                progressBar.value = 100;
                
                // Load status log for this video first
                await loadStatusLog(videoId);
                
                // Check if we have completion in the log, if not show "loaded from cache"
                const logKey = `statusLog_${videoId}`;
                const result = await chrome.storage.local.get([logKey]);
                const logs = result[logKey] || [];
                const hasCompletion = logs.some(log => log.status.includes('Summarization successful'));
                
                if (!hasCompletion) {
                    updateProgress('📋 Loaded from cache', true);
                } else {
                    // Don't override the progress text if we have completion in log
                    // Set text directly without logging to avoid duplicates
                    progressText.textContent = '✅ Summarization successful!';
                    progressBar.value = 100;
                }
                
                return;
            }
            
            // Check if there's an active task
            const taskStatus = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getTaskStatus',
                    videoId: videoId
                }, (response) => {
                    resolve(response);
                });
            });
            
            if (taskStatus && taskStatus.status !== 'idle') {
                console.log('🔄 Found active task for video:', videoId, 'Status:', taskStatus.status);
                
                if (taskStatus.status === 'completed' && taskStatus.summary) {
                    displayResult(taskStatus.summary);
                    // No need for completion message - summary display indicates success
                } else {
                    // Show processing state
                    summarizeBtn.disabled = true;
                    summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
                    statusDiv.style.display = 'block';
                    progressBar.style.display = 'block';
                    
                    let statusText = '🔄 Processing in background...';
                    if (taskStatus.status === 'downloading') statusText = '📥 Downloading audio...';
                    else if (taskStatus.status === 'transcribing') statusText = '🎵 Transcribing audio...';
                    else if (taskStatus.status === 'summarizing') statusText = '🤖 Summarizing with Qwen3 AI...';
                    
                    updateProgress(statusText, true); // Skip logging since this is UI restoration
                }
            }
            
            // Always load status log for this video (even if no active task)
            loadStatusLog(videoId);
            
        } catch (error) {
            console.error('Error checking video status:', error);
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
        } else if (request.action === 'statusUpdate') {
            // Check if this update is for the current video
            const currentVideoId = getCurrentVideoId();
            if (currentVideoId === request.videoId) {
                updateProgress(request.status, true); // Skip logging - background already logged it
                // Refresh the log display to show the new entry
                loadStatusLog(currentVideoId);
            }
        } else if (request.action === 'summaryReady') {
            // Check if this summary is for the current video
            const currentVideoId = getCurrentVideoId();
            console.log('📨 Summary ready for video:', request.videoId, 'Current video:', currentVideoId);
            if (currentVideoId === request.videoId) {
                console.log('✅ Displaying summary for current video');
                displayResult(request.summary);
                // Remove redundant completion message - the summary display itself indicates success
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
            }
        }
    });
    
    function getCurrentVideoId() {
        return localStorage.getItem('currentVideoId');
    }

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
        summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Starting...';
        summaryResultDiv.innerHTML = ''; // Clear previous summary
        statusDiv.style.display = 'block';
        progressBar.style.display = 'block';
        
        try {
            // Get video info and send to background script
            const videoInfo = await getVideoInfoFromURL();
            
            chrome.runtime.sendMessage({
                action: 'summarizeVideo',
                videoInfo: videoInfo
            }, function(result) {
                if (result && result.success) {
                    if (result.processing) {
                        // Processing started in background
                        updateProgress('🚀 Processing started in background...');
                        summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
                        // Button stays disabled until completion
                    } else if (result.summary) {
                        // Immediate result (from cache)
                        if (result.cached) {
                            updateProgress('📋 Loaded from cache');
                        } else {
                            // Don't show redundant completion message for immediate results
                            // The summary display itself indicates success
                        }
                        setTimeout(() => {
                            displayResult(result.summary, result.cached);
                        }, 500);
                        summarizeBtn.disabled = false;
                        summarizeBtn.innerHTML = '🚀 Generate Summary';
                    }
                } else {
                    if (result && result.error === 'Summarization already in progress for this video') {
                        updateProgress('🔄 Summarization already running in background...');
                        summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
                        // Keep button disabled until completion
                    } else {
                        displayError(result ? result.error : 'Unknown error occurred');
                        updateProgress('❌ Failed to generate summary');
                        summarizeBtn.disabled = false;
                        summarizeBtn.innerHTML = '🚀 Generate Summary';
                    }
                }
            });
            
        } catch (error) {
            displayError(error);
            updateProgress('❌ Failed to process video');
            summarizeBtn.disabled = false;
            summarizeBtn.innerHTML = '🚀 Generate Summary';
        }
    }

    function updateProgress(status, skipLogging = false) {
        progressText.textContent = status;
        
        // Update progress bar based on status
        let progress = 0;
        if (status.includes('Downloading audio')) progress = 30;
        else if (status.includes('Transcribing audio')) progress = 65;
        else if (status.includes('Summarizing with Qwen3')) progress = 90;
        else if (status.includes('Summarization successful')) progress = 100;
        else if (status.includes('Failed') || status.includes('Error')) progress = 0;
        
        progressBar.value = progress;
        
        // Only add to log if this is a new status update, not a UI restoration
        if (!skipLogging) {
            addStatusToLog(status);
        }
    }
    
    async function addStatusToLog(status) {
        const timestamp = new Date().toLocaleTimeString();
        const currentVideoId = getCurrentVideoId();
        
        if (!currentVideoId) return;
        
        try {
            // Get existing logs from Chrome storage
            const logKey = `statusLog_${currentVideoId}`;
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
            
            // Save back to Chrome storage
            await chrome.storage.local.set({ [logKey]: logs });
            
            // Update the UI
            displayStatusLog(logs);
        } catch (error) {
            console.error('Failed to add status to log:', error);
        }
    }
    
    function displayStatusLog(logs) {
        const statusLog = document.getElementById('statusLog');
        if (statusLog && logs) {
            statusLog.innerHTML = logs.map(log => 
                `<div class="status-entry">[${log.timestamp}] ${log.status}</div>`
            ).join('');
            statusLog.scrollTop = statusLog.scrollHeight;
        }
    }
    
    async function loadStatusLog(videoId) {
        try {
            const logKey = `statusLog_${videoId}`;
            const result = await chrome.storage.local.get([logKey]);
            const logs = result[logKey] || [];
            if (logs.length > 0) {
                displayStatusLog(logs);
            }
        } catch (error) {
            console.error('Failed to load status log:', error);
        }
    }

    function displayResult(summary, cached = false) {
        summaryResultDiv.innerHTML = `
            <div class="summary-container">
                <h3>📋 Summary ${cached ? '<small style="opacity: 0.7;">(cached)</small>' : ''}</h3>
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
                        <li>Make sure your Qwen3 server is running on localhost:11434</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Initialize the popup
    initializePopup();
});
