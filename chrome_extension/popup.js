// Popup script for YouTube Summarizer extension

document.addEventListener('DOMContentLoaded', function() {
    const summarizeBtn = document.getElementById('summarizeBtn');
    const statusDiv = document.getElementById('status');
    const summaryResultDiv = document.getElementById('summaryResult');
    const videoInfoDiv = document.getElementById('videoInfo');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Get video info from content script with retry logic
    function getVideoInfoWithRetry(maxRetries = 3) {
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
                    
                    chrome.tabs.sendMessage(tabs[0].id, {action: 'getVideoInfo'}, function(response) {
                        console.log('📨 Response from content script:', response);
                        
                        if (chrome.runtime.lastError) {
                            console.log('❌ Runtime error:', chrome.runtime.lastError);
                            if (attempts < maxRetries) {
                                setTimeout(attempt, 1000);
                            } else {
                                reject('Content script not responding');
                            }
                            return;
                        }
                        
                        if (response && response.success && response.videoInfo) {
                            resolve(response.videoInfo);
                        } else if (response && !response.success) {
                            if (attempts < maxRetries) {
                                console.log(`⏳ Retrying in 1 second... (${attempts}/${maxRetries})`);
                                setTimeout(attempt, 1000);
                            } else {
                                reject(response.error || 'Could not get video information');
                            }
                        } else {
                            if (attempts < maxRetries) {
                                console.log(`⏳ No response, retrying in 1 second... (${attempts}/${maxRetries})`);
                                setTimeout(attempt, 1000);
                            } else {
                                reject('Could not get video information. Make sure you are on a YouTube video page.');
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
            updateProgress('🔍 Detecting video...');
            const videoInfo = await getVideoInfoWithRetry();
            displayVideoInfo(videoInfo);
            updateProgress('✅ Video detected successfully!');
        } catch (error) {
            console.error('❌ Error initializing popup:', error);
            displayError(error);
            updateProgress('❌ Failed to detect video');
        }
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
    }

    async function startSummarization() {
        // Reset UI
        summarizeBtn.disabled = true;
        summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
        summaryResultDiv.innerHTML = ''; // Clear previous summary
        statusDiv.style.display = 'block';
        progressBar.style.display = 'block';
        
        // Initial status
        updateProgress('🚀 Starting summarization...');

        try {
            // Get video info and send to background script
            const videoInfo = await getVideoInfoWithRetry();
            
            chrome.runtime.sendMessage({
                action: 'summarizeVideo',
                videoInfo: videoInfo
            }, function(result) {
                if (result && result.success) {
                    displayResult(result.summary);
                    updateProgress('✅ Summary completed!');
                } else {
                    displayError(result ? result.error : 'Unknown error occurred');
                    updateProgress('❌ Failed to generate summary');
                }
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
            });
        } catch (error) {
            displayError(error);
            updateProgress('❌ Failed to get video info');
            summarizeBtn.disabled = false;
            summarizeBtn.innerHTML = '🚀 Generate Summary';
        }
    }

    function updateProgress(status) {
        progressText.textContent = status;
        
        // Update progress bar based on status
        let progress = 0;
        if (status.includes('Starting')) progress = 10;
        else if (status.includes('Connecting')) progress = 20;
        else if (status.includes('Extracting')) progress = 30;
        else if (status.includes('Downloading')) progress = 40;
        else if (status.includes('Transcribing')) progress = 60;
        else if (status.includes('Generating')) progress = 80;
        else if (status.includes('completed') || status.includes('successfully')) progress = 100;
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
                        <li>Make sure the Docker server is running</li>
                        <li>Check your Gemini API key in the .env file</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Initialize the popup
    initializePopup();
});
