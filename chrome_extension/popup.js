// Popup script for YouTube Summarizer extension

document.addEventListener('DOMContentLoaded', function() {
    const summarizeBtn = document.getElementById('summarizeBtn');
    const statusDiv = document.getElementById('status');
    const summaryResultDiv = document.getElementById('summaryResult');
    const videoInfoDiv = document.getElementById('videoInfo');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    // Global variable to store processing timeout
    let currentProcessingTimeout = null;
    let currentVideoId = null;

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
            console.log('🚀 Initializing popup...');
            
            // Try to get video info from current tab URL first (fastest method)
            const videoInfo = await getVideoInfoFromURL();
            console.log('📹 Video info received:', videoInfo);
            
            if (videoInfo && videoInfo.videoId) {
                // Store current video ID
                currentVideoId = videoInfo.videoId;
                localStorage.setItem('currentVideoId', videoInfo.videoId);
                console.log('💾 Stored currentVideoId:', videoInfo.videoId);
                
                // Check if this is a different video than last time
                const lastVideoId = localStorage.getItem('lastVideoId');
                if (lastVideoId && lastVideoId !== videoInfo.videoId) {
                    // Clear any previous results if video changed
                    summaryResultDiv.innerHTML = '';
                    console.log('🔄 Video changed, cleared previous results');
                }
                
                displayVideoInfo(videoInfo);
                
                // Check for cached summary or active task
                console.log('🔍 Checking video status...');
                await checkVideoStatus(videoInfo.videoId);
                
                // Also check for any stored results in storage
                console.log('🔍 Checking stored results...');
                await checkStoredResults(videoInfo.videoId);
                
                // Check for results in localStorage as a final fallback
                console.log('🔍 Checking localStorage results...');
                await checkLocalStorageResults(videoInfo.videoId);
                
                // Final fallback: check if we have any results displayed and restore them
                console.log('🔍 Checking displayed results...');
                restoreDisplayedResults();
                
                // Log what we found for debugging
                console.log('🔍 Cache check complete for video:', videoInfo.videoId);
                console.log('🔍 Summary div content length:', summaryResultDiv.innerHTML.length);
                console.log('🔍 Summary div content preview:', summaryResultDiv.innerHTML.substring(0, 100));
                
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
                
                // Enable the button and show ready state
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
                
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
                
                // Clear the processing timeout since we have a result
                clearProcessingTimeout();
                
                return;
            }
            
            // Check if there's an active task
            const taskStatus = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getTaskStatus',
                    videoId: videoId
                }, (response) => {
                    console.log('🔍 Task status response:', response);
                    if (chrome.runtime.lastError) {
                        console.error('❌ Error getting task status:', chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('🔍 Task status for video:', videoId, 'Result:', taskStatus);
            
            if (taskStatus && taskStatus.status && taskStatus.status !== 'idle') {
                console.log('🔄 Found active task for video:', videoId, 'Status:', taskStatus.status);
                
                if (taskStatus.status === 'completed' && taskStatus.summary) {
                    console.log('✅ Task completed, displaying result');
                    displayResult(taskStatus.summary);
                    // Enable button and show completion state
                    summarizeBtn.disabled = false;
                    summarizeBtn.innerHTML = '🚀 Generate Summary';
                    // Show status section with completion
                    statusDiv.style.display = 'block';
                    progressBar.style.display = 'block';
                    progressBar.value = 100;
                    progressText.textContent = '✅ Summarization completed!';
                    // Clear the processing timeout since we have a result
                    clearProcessingTimeout();
                    return; // Exit early since we've handled the completion
                } else if (taskStatus.isActive) {
                    // Show processing state for ongoing background tasks
                    console.log('🔄 Restoring UI for ongoing background task:', taskStatus.statusMessage);
                    
                    summarizeBtn.disabled = true;
                    summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
                    statusDiv.style.display = 'block';
                    progressBar.style.display = 'block';
                    
                    // Use the status message from the background task
                    const statusText = taskStatus.statusMessage || '🔄 Processing in background...';
                    updateProgress(statusText, true); // Skip logging since this is UI restoration
                    
                    // Set progress bar based on task status
                    if (taskStatus.progress) {
                        progressBar.value = taskStatus.progress;
                    } else {
                        // Default progress based on status
                        if (taskStatus.status === 'downloading') progressBar.value = 20;
                        else if (taskStatus.status === 'transcribing') progressBar.value = 60;
                        else if (taskStatus.status === 'summarizing') progressBar.value = 85;
                        else progressBar.value = 50;
                    }
                    
                    // Set progress text
                    progressText.textContent = statusText;
                    
                    // Don't clear the processing timeout since task is still active
                    console.log('🔄 UI restored for ongoing background task');
                    
                    // Set up a periodic check to see if the task has completed
                    setupBackgroundTaskMonitoring(videoId);
                    
                    return; // Exit early since we've handled the ongoing task
                } else {
                    // Show processing state
                    summarizeBtn.disabled = true;
                    summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
                    statusDiv.style.display = 'block';
                    progressBar.style.display = 'block';
                    
                    let statusText = '🔄 Processing in background...';
                    if (taskStatus.status === 'downloading') statusText = '📥 Downloading audio...';
                    else if (taskStatus.status === 'transcribing') statusText = '🎵 Transcribing audio...';
                    else if (taskStatus.status === 'summarizing') statusText = '🤖 Summarizing with Gemini AI...';
                    
                    updateProgress(statusText, true); // Skip logging since this is UI restoration
                    
                    // Set up monitoring for this task
                    setupBackgroundTaskMonitoring(videoId);
                    
                    return; // Exit early since we've handled the task
                }
            } else {
                console.log('🔍 No active task found for video:', videoId);
            }
            
            // Always load status log for this video (even if no active task)
            loadStatusLog(videoId);
            
            // If we reach here and no button state was set, set to default "Generate Summary" state
            // This ensures the button is properly configured when there's no ongoing task
            console.log('🔄 Setting default button state for video:', videoId);
            summarizeBtn.disabled = false;
            summarizeBtn.innerHTML = '🚀 Generate Summary';
            // Hide status section if no active task
            statusDiv.style.display = 'none';
            progressBar.style.display = 'none';
            
        } catch (error) {
            console.error('Error checking video status:', error);
            // Set default button state on error
            summarizeBtn.disabled = false;
            summarizeBtn.innerHTML = '🚀 Generate Summary';
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
                const tabId = tabs[0].id;
                
                console.log('Tab URL:', url);
                console.log('Tab Title:', title);
                console.log('Tab ID:', tabId);
                
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
                    url: url,
                    tabId: tabId
                };
                
                console.log('✅ Video info from URL:', videoInfo);
                resolve(videoInfo);
            });
        });
    }

    function displayVideoInfo(videoInfo) {
        videoInfoDiv.innerHTML = `
            <div class="video-info">
                <h3>📺 ${videoInfo.title}</h3>
            </div>
        `;
        // Don't set button state here - let checkVideoStatus determine it
        // based on whether there's an ongoing task or cached result
        
        // Store current video ID to detect changes
        localStorage.setItem('lastVideoId', videoInfo.videoId);
        localStorage.setItem('currentVideoId', videoInfo.videoId);
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

    // Listen for status updates from background script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('📨 Popup received message:', request);
        
        if (request.action === 'updateStatus') {
            console.log('📨 Processing updateStatus:', request.status);
            updateProgress(request.status);
        } else if (request.action === 'statusUpdate') {
            // Check if this update is for the current video
            const currentVideoId = getCurrentVideoId();
            console.log('📨 Processing statusUpdate for video:', request.videoId, 'Current video:', currentVideoId);
            if (currentVideoId === request.videoId) {
                console.log('✅ Status update matches current video, updating progress');
                updateProgress(request.status, true); // Skip logging - background already logged it
                // Refresh the log display to show the new entry
                loadStatusLog(currentVideoId);
            } else {
                console.log('❌ Status update video ID mismatch');
            }
        } else if (request.action === 'summaryReady') {
            // Check if this summary is for the current video
            const currentVideoId = getCurrentVideoId();
            console.log('📨 Summary ready for video:', request.videoId, 'Current video:', currentVideoId);
            console.log('📨 Summary content:', request.summary);
            console.log('📨 Summary length:', request.summary ? request.summary.length : 'NO SUMMARY');
            
            if (currentVideoId === request.videoId) {
                console.log('✅ Displaying summary for current video');
                
                // Clear any monitoring intervals since we have the result
                if (window.backgroundTaskInterval) {
                    clearInterval(window.backgroundTaskInterval);
                    window.backgroundTaskInterval = null;
                }
                if (window.storageCheckInterval) {
                    clearInterval(window.storageCheckInterval);
                    window.storageCheckInterval = null;
                }
                
                // Display the result immediately
                displayResult(request.summary);
                
                // Enable the button and show completion state
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
                
                // Also update the progress to show completion
                updateProgress('✅ Summarization successful!', true);
                progressBar.value = 100;
                
                // Store the result in storage as a backup (in case display failed)
                chrome.storage.local.set({
                    [`summaryResult_${currentVideoId}`]: {
                        summary: request.summary,
                        timestamp: Date.now(),
                        videoId: currentVideoId
                    }
                }).then(() => {
                    console.log('💾 Stored summary as backup in storage');
                }).catch((error) => {
                    console.error('❌ Failed to store backup summary:', error);
                });
                
                // Also store in localStorage as an additional backup
                localStorage.setItem(`summary_${currentVideoId}`, request.summary);
                localStorage.setItem(`summary_timestamp_${currentVideoId}`, Date.now().toString());
                console.log('💾 Stored summary in localStorage as backup');
                
                console.log('✅ Summary display completed successfully');
            } else {
                console.log('❌ Video ID mismatch - not displaying summary');
            }
        } else {
            console.log('📨 Unknown message action:', request.action);
        }
    });
    
    function getCurrentVideoId() {
        return currentVideoId || localStorage.getItem('currentVideoId');
    }

    // Handle summarize button click
    summarizeBtn.addEventListener('click', function() {
        startSummarization();
    });

    function updateProgress(status, skipLogging = false) {
        progressText.textContent = status;
        
        // Update progress bar based on status
        let progress = 0;
        if (status.includes('Downloading audio')) progress = 30;
        else if (status.includes('Transcribing audio')) progress = 65;
        else if (status.includes('Summarizing with Gemini')) progress = 90;
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
    
    async function checkStoredResults(videoId) {
        try {
            console.log('🔍 Checking for stored results for video:', videoId);
            const result = await chrome.storage.local.get([`summaryResult_${videoId}`]);
            const storedResult = result[`summaryResult_${videoId}`];
            
            if (storedResult && storedResult.summary) {
                console.log('📋 Found stored result for video:', videoId);
                displayResult(storedResult.summary);
                
                // Enable the button and show ready state
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
                
                // Show status section with results
                statusDiv.style.display = 'block';
                progressBar.style.display = 'block';
                progressBar.value = 100;
                progressText.textContent = '✅ Summarization successful!';
                
                // Load status log for this video first
                await loadStatusLog(videoId);
                
                // Clear the stored result since we've displayed it
                await chrome.storage.local.remove([`summaryResult_${videoId}`]);
                console.log('🧹 Cleared stored result for video:', videoId);
                
                // Clear the processing timeout since we have a result
                clearProcessingTimeout();
                return true; // Indicate we found and displayed a result
            }
            
            // Also check for error results
            const errorResult = await chrome.storage.local.get([`errorResult_${videoId}`]);
            const storedError = errorResult[`errorResult_${videoId}`];
            
            if (storedError && storedError.error) {
                console.log('❌ Found stored error for video:', videoId);
                displayError(storedError.error);
                
                // Enable the button and show error state
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
                
                // Show status section with error
                statusDiv.style.display = 'block';
                progressBar.style.display = 'block';
                progressBar.value = 0;
                progressText.textContent = '❌ Summarization failed';
                
                // Load status log for this video
                await loadStatusLog(videoId);
                
                // Clear the stored error since we've displayed it
                await chrome.storage.local.remove([`errorResult_${videoId}`]);
                console.log('🧹 Cleared stored error for video:', videoId);
                
                // Clear the processing timeout since we have an error
                clearProcessingTimeout();
                return true; // Indicate we found and displayed an error
            }
            
            return false; // No stored result or error found
        } catch (error) {
            console.error('❌ Error checking stored results:', error);
            return false;
        }
    }
    
    // Check localStorage for results as a final fallback
    async function checkLocalStorageResults(videoId) {
        try {
            console.log('🔍 Checking localStorage for results for video:', videoId);
            const storedSummary = localStorage.getItem(`summary_${videoId}`);
            const storedTimestamp = localStorage.getItem(`summary_timestamp_${videoId}`);
            
            if (storedSummary && storedTimestamp) {
                // Check if the result is not too old (within 24 hours)
                const timestamp = parseInt(storedTimestamp);
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                
                if (timestamp > twentyFourHoursAgo) {
                    console.log('📋 Found localStorage result for video:', videoId);
                    displayResult(storedSummary, true);
                    
                    // Enable the button and show ready state
                    summarizeBtn.disabled = false;
                    summarizeBtn.innerHTML = '🚀 Generate Summary';
                    
                    // Show status section with results
                    statusDiv.style.display = 'block';
                    progressBar.style.display = 'block';
                    progressBar.value = 100;
                    progressText.textContent = '📋 Loaded from cache';
                    
                    // Load status log for this video
                    await loadStatusLog(videoId);
                    
                    // Clear the processing timeout since we have a result
                    clearProcessingTimeout();
                    return true; // Indicate we found and displayed a result
                } else {
                    // Result is too old, clean it up
                    localStorage.removeItem(`summary_${videoId}`);
                    localStorage.removeItem(`summary_timestamp_${videoId}`);
                    console.log('🧹 Cleaned up old localStorage result for video:', videoId);
                }
            }
            return false; // No stored result found
        } catch (error) {
            console.error('❌ Error checking localStorage results:', error);
            return false;
        }
    }
    
    // Final fallback: check if we have any results displayed and restore them
    function restoreDisplayedResults() {
        try {
            // If we already have content in the summary div, don't clear it
            if (summaryResultDiv.innerHTML.trim() !== '') {
                console.log('🔍 Found existing displayed results, preserving them');
                statusDiv.style.display = 'block';
                progressBar.style.display = 'block';
                progressBar.value = 100;
                progressText.textContent = '📋 Results restored';
                summarizeBtn.disabled = false;
                summarizeBtn.innerHTML = '🚀 Generate Summary';
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error restoring displayed results:', error);
            return false;
        }
    }

    // Set up monitoring for background tasks
    function setupBackgroundTaskMonitoring(videoId) {
        console.log('🔍 Setting up background task monitoring for video:', videoId);
        
        // Clear any existing monitoring interval
        if (window.backgroundTaskInterval) {
            clearInterval(window.backgroundTaskInterval);
        }
        
        // Set up periodic checking every 2 seconds
        window.backgroundTaskInterval = setInterval(async () => {
            try {
                console.log('🔍 Checking background task status for video:', videoId);
                
                // Check if task is still active
                const taskStatus = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'getTaskStatus',
                        videoId: videoId
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            resolve(null);
                        } else {
                            resolve(response);
                        }
                    });
                });
                
                if (!taskStatus || taskStatus.status === 'idle') {
                    console.log('✅ Background task completed or no longer active for video:', videoId);
                    clearInterval(window.backgroundTaskInterval);
                    window.backgroundTaskInterval = null;
                    
                    // Check for results in storage
                    await checkStoredResults(videoId);
                    return;
                }
                
                if (taskStatus.status === 'completed' && taskStatus.summary) {
                    console.log('✅ Background task completed with summary for video:', videoId);
                    clearInterval(window.backgroundTaskInterval);
                    window.backgroundTaskInterval = null;
                    
                    // Display the result
                    displayResult(taskStatus.summary);
                    summarizeBtn.disabled = false;
                    summarizeBtn.innerHTML = '🚀 Generate Summary';
                    return;
                }
                
                // Update progress if status changed
                if (taskStatus.statusMessage && taskStatus.statusMessage !== progressText.textContent) {
                    updateProgress(taskStatus.statusMessage, true);
                    if (taskStatus.progress) {
                        progressBar.value = taskStatus.progress;
                    }
                }
                
            } catch (error) {
                console.error('❌ Error monitoring background task:', error);
            }
        }, 2000);
        
        // Also check for results in storage periodically as a backup
        if (window.storageCheckInterval) {
            clearInterval(window.storageCheckInterval);
        }
        
        window.storageCheckInterval = setInterval(async () => {
            try {
                const hasResults = await checkStoredResults(videoId);
                if (hasResults) {
                    console.log('✅ Found results in storage, clearing monitoring intervals');
                    clearInterval(window.backgroundTaskInterval);
                    clearInterval(window.storageCheckInterval);
                    window.backgroundTaskInterval = null;
                    window.storageCheckInterval = null;
                }
            } catch (error) {
                console.error('❌ Error checking storage for results:', error);
            }
        }, 3000);
    }

    // Clear processing timeout
    function clearProcessingTimeout() {
        if (currentProcessingTimeout) {
            clearTimeout(currentProcessingTimeout);
            currentProcessingTimeout = null;
            console.log('⏰ Cleared processing timeout');
        }
    }
    
    function displayResult(summary, cached = false) {
        try {
            console.log('🎯 displayResult called with summary:', summary);
            console.log('🎯 summaryResultDiv element:', summaryResultDiv);
            console.log('🎯 Summary type:', typeof summary);
            console.log('🎯 Summary length:', summary ? summary.length : 'NO SUMMARY');
            
            if (!summaryResultDiv) {
                console.error('❌ summaryResultDiv is null or undefined');
                return;
            }
            
            if (!summary || typeof summary !== 'string') {
                console.error('❌ Invalid summary:', summary);
                return;
            }
            
            if (summary.trim() === '') {
                console.error('❌ Summary is empty or only whitespace');
                return;
            }
            
            // Clear the processing timeout since we have a result
            clearProcessingTimeout();
            
            // Ensure the status section is visible
            statusDiv.style.display = 'block';
            progressBar.style.display = 'block';
            progressBar.value = 100;
            
            // Format the summary with proper line breaks and paragraphs
            const formattedSummary = summary
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => `<p>${line.trim()}</p>`)
                .join('');
            
            console.log('🎯 Formatted summary:', formattedSummary);
            
            summaryResultDiv.innerHTML = `
                <div class="summary-container">
                    <h3>📋 Summary ${cached ? '<small style="opacity: 0.7;">(cached)</small>' : ''}</h3>
                    <div class="summary-content">
                        ${formattedSummary}
                    </div>
                    <div class="summary-actions">
                        <button id="copyBtn" class="summary-action-btn">📋 Copy</button>
                        <button id="saveBtn" class="summary-action-btn">💾 Save</button>
                    </div>
                </div>
            `;
            
            console.log('✅ Summary displayed successfully');
            console.log('✅ Summary div content length:', summaryResultDiv.innerHTML.length);
            console.log('✅ Summary div content preview:', summaryResultDiv.innerHTML.substring(0, 200));
            
            // Add event listeners for copy and save buttons
            const copyBtn = document.getElementById('copyBtn');
            const saveBtn = document.getElementById('saveBtn');
            
            if (copyBtn) {
                copyBtn.addEventListener('click', function() {
                    navigator.clipboard.writeText(summary).then(function() {
                        this.textContent = '✅ Copied!';
                        setTimeout(() => {
                            this.textContent = '📋 Copy';
                        }, 2000);
                    }.bind(this));
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
            
        } catch (error) {
            console.error('❌ Error in displayResult:', error);
            console.error('❌ Error stack:', error.stack);
        }
    }

    function displayError(error) {
        // Clear the processing timeout since we have an error
        clearProcessingTimeout();
        
        // Parse error message for better display
        let errorMessage = error;
        let errorDetails = '';
        
        if (typeof error === 'string') {
            if (error.includes('Connection failed')) {
                errorMessage = 'Connection failed. Please check if the server is running.';
                errorDetails = 'Make sure the Python backend server is started and accessible at http://localhost:5000';
            } else if (error.includes('API key')) {
                errorMessage = 'Gemini API connection failed.';
                errorDetails = 'Please check your .env file and ensure GEMINI_API_KEY is set correctly.';
            } else if (error.includes('YouTube temporarily blocked')) {
                errorMessage = 'YouTube temporarily blocked the request.';
                errorDetails = 'This usually resolves itself. Please try again in a few minutes.';
            } else if (error.includes('Failed to fetch')) {
                errorMessage = 'Network connection failed.';
                errorDetails = 'Please check your internet connection and try again.';
            }
        }
        
        summaryResultDiv.innerHTML = `
            <div class="error-container">
                <h3>❌ Error</h3>
                <p><strong>${errorMessage}</strong></p>
                ${errorDetails ? `<p class="error-details">${errorDetails}</p>` : ''}
                <div class="error-help">
                    <p><strong>Common solutions:</strong></p>
                    <ul>
                        <li>Make sure you're on a YouTube video page</li>
                        <li>Refresh the page and try again</li>
                        <li>Make sure the Python backend server is running</li>
                        <li>Check your Gemini API key in the .env file</li>
                        <li>Ensure the video is not age-restricted or private</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Initialize the popup
    console.log('🎬 Popup script loaded, starting initialization...');
    
    // Cleanup function to clear intervals when popup is closed
    function cleanup() {
        if (window.backgroundTaskInterval) {
            clearInterval(window.backgroundTaskInterval);
            window.backgroundTaskInterval = null;
        }
        if (window.storageCheckInterval) {
            clearInterval(window.storageCheckInterval);
            window.storageCheckInterval = null;
        }
        console.log('🧹 Cleaned up popup intervals');
    }
    
    // Clean up when popup is about to unload
    window.addEventListener('beforeunload', cleanup);
    
    // Clean up when popup loses focus (user navigated away)
    window.addEventListener('blur', cleanup);
    
    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
        initializePopup();
        
        // Set up periodic checking for results as a backup mechanism
        setInterval(async () => {
            try {
                const currentVideoId = getCurrentVideoId();
                if (currentVideoId && !summaryResultDiv.innerHTML.trim()) {
                    // Only check if we don't already have results displayed
                    console.log('🔍 Periodic check for results for video:', currentVideoId);
                    await checkStoredResults(currentVideoId);
                }
            } catch (error) {
                console.error('❌ Error in periodic result check:', error);
            }
        }, 5000); // Check every 5 seconds
        
    }, 100);
});
