#!/usr/bin/env python3
"""
Flask server for YouTube Video Summarizer
Provides REST API endpoints for video summarization using Whisper + Gemini.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import threading
import time

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import summarizer functions
from summarize_youtube_gemini import (
    get_video_info, 
    get_transcript_with_whisper, 
    summarize_with_gemini
)

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Global storage for processing status
processing_status = {}

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy'
    })

@app.route('/summarize', methods=['POST'])
def summarize_video():
    """Asynchronous endpoint for video summarization"""
    try:
        data = request.get_json()
        
        if not data or 'video_url' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing video_url in request'
            }), 400
        
        video_url = data['video_url']
        video_title = data.get('video_title', '')
        
        # Generate unique request ID
        request_id = f"req_{int(time.time())}"
        processing_status[request_id] = 'Starting...'
        
        # Start processing in background thread
        thread = threading.Thread(
            target=process_video_summary,
            args=(request_id, video_url, video_title)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'request_id': request_id,
            'message': 'Processing started'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/status/<request_id>', methods=['GET'])
def get_status(request_id):
    """Get processing status for a request"""
    status = processing_status.get(request_id, 'Not found')
    return jsonify({
        'request_id': request_id,
        'status': status
    })

@app.route('/result/<request_id>', methods=['GET'])
def get_result(request_id):
    """Get the final result for a request"""
    if request_id not in processing_status:
        return jsonify({
            'success': False,
            'error': 'Request not found'
        }), 404
    
    status = processing_status[request_id]
    
    if isinstance(status, dict) and status.get('type') == 'complete':
        # Clean up and return result
        del processing_status[request_id]
        return jsonify({
            'success': True,
            'summary': status['summary']
        })
    elif isinstance(status, dict) and status.get('type') == 'error':
        # Clean up and return error
        del processing_status[request_id]
        return jsonify({
            'success': False,
            'error': status['error']
        })
    else:
        return jsonify({
            'success': False,
            'status': status,
            'message': 'Still processing'
        })

def process_video_summary(request_id, video_url, video_title):
    """Process video summary in background thread"""
    try:
        # Update status
        processing_status[request_id] = 'Extracting video info...'
        
        # Get video info
        video_id, extracted_title = get_video_info(video_url)
        if not video_id:
            processing_status[request_id] = {
                'type': 'error',
                'error': 'Could not extract video ID from URL'
            }
            return
        
        # Use extracted title if not provided
        if not video_title:
            video_title = extracted_title
        
        processing_status[request_id] = 'Downloading and transcribing audio...'
        
        # Get transcript
        transcript = get_transcript_with_whisper(video_url, video_id)
        if not transcript:
            processing_status[request_id] = {
                'type': 'error',
                'error': 'Could not transcribe video audio'
            }
            return
        
        processing_status[request_id] = 'Generating summary with AI...'
        
        # Generate summary
        summary = summarize_with_gemini(transcript, video_title)
        if not summary:
            processing_status[request_id] = {
                'type': 'error',
                'error': 'Could not generate summary'
            }
            return
        
        # Store result
        processing_status[request_id] = {
            'type': 'complete',
            'summary': summary
        }
        
    except Exception as e:
        processing_status[request_id] = {
            'type': 'error',
            'error': str(e)
        }

@app.route('/summarize-sync', methods=['POST'])
def summarize_video_sync():
    """Synchronous endpoint for immediate response (for shorter videos)"""
    try:
        data = request.get_json()
        
        if not data or 'video_url' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing video_url in request'
            }), 400
        
        video_url = data['video_url']
        video_title = data.get('video_title', '')
        
        print(f"Processing request for URL: {video_url}")
        
        # Get video info
        try:
            print("🔍 Extracting video information...")
            video_id, extracted_title = get_video_info(video_url)
            print(f"Extracted video_id: {video_id}, title: {extracted_title}")
        except Exception as e:
            print(f"Error extracting video info: {e}")
            return jsonify({
                'success': False,
                'error': f'Could not extract video ID from URL: {str(e)}'
            }), 400
            
        if not video_id:
            return jsonify({
                'success': False,
                'error': 'Could not extract video ID from URL'
            }), 400
        
        # Use extracted title if not provided
        if not video_title:
            video_title = extracted_title
        
        # Get transcript
        try:
            print("🎵 Downloading and transcribing audio...")
            transcript = get_transcript_with_whisper(video_url, video_id)
            print(f"Transcript length: {len(transcript) if transcript else 0} characters")
        except Exception as e:
            print(f"Error getting transcript: {e}")
            return jsonify({
                'success': False,
                'error': f'Could not transcribe video audio: {str(e)}'
            }), 400
            
        if not transcript:
            return jsonify({
                'success': False,
                'error': 'Could not transcribe video audio'
            }), 400
        
        # Generate summary
        print("🤖 Generating AI summary...")
        summary = summarize_with_gemini(transcript, video_title)
        if not summary:
            return jsonify({
                'success': False,
                'error': 'Could not generate summary'
            }), 400
        
        print("✅ Summary generated successfully!")
        return jsonify({
            'success': True,
            'summary': summary,
            'video_id': video_id,
            'video_title': video_title
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("🚀 Starting YouTube Summarizer Server...")
    print("📡 Server will be available at: http://localhost:5000")
    print("🔧 Health check: http://localhost:5000/health")
    print("📝 Summarize endpoint: http://localhost:5000/summarize")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
