#!/usr/bin/env python3
"""
YouTube Video Summarizer using Whisper + Gemini
Downloads YouTube videos, transcribes audio, and generates AI summaries.
"""

import os
import re
import glob
import shutil
import subprocess
import numpy as np
import requests
import json 
import yt_dlp
import whisper
import torch
from urllib.parse import urlparse, parse_qs
import google.generativeai as genai

# Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash-exp')

# Global Whisper model instance (loaded once, reused many times)
_whisper_model = None
_whisper_device = None

# FFmpeg path for Docker environment
FFMPEG_PATH = "ffmpeg"

# YouTube URL patterns
YOUTUBE_PATTERNS = [
    r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
    r'youtube\.com\/watch\?.*v=([^&\n?#]+)'
]

# yt-dlp configuration with more flexible format selection
YDL_OPTS = {
    'format': 'bestaudio/best[height<=480]/worst',
    'user_agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'extractor_retries': 3,
    'retries': 3,
    'extract_flat': False,
    'no_warnings': False,
}

def initialize_whisper_model(model_name="base", force_reload=False):
    """Initialize and load the Whisper model once for reuse"""
    global _whisper_model, _whisper_device
    
    # Return existing model if already loaded and not forcing reload
    if _whisper_model is not None and not force_reload:
        print(f"✅ Whisper model already loaded on {_whisper_device}")
        return _whisper_model
    
    try:
        # Check for CUDA availability
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Initializing Whisper model '{model_name}' on device: {device}")
        
        # Load the model
        model = whisper.load_model(model_name, device=device)
        
        # Store globally for reuse
        _whisper_model = model
        _whisper_device = device
        
        print(f"✅ Whisper model '{model_name}' loaded successfully and cached for reuse!")
        return model
        
    except Exception as e:
        print(f"❌ Error loading Whisper model: {e}")
        _whisper_model = None
        _whisper_device = None
        raise

def get_whisper_model():
    """Get the loaded Whisper model, initializing if necessary"""
    global _whisper_model
    
    if _whisper_model is None:
        return initialize_whisper_model()
    
    return _whisper_model

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    for pattern in YOUTUBE_PATTERNS:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_video_info(url):
    """Extract video ID and title from YouTube URL"""
    video_id = extract_video_id(url)
    if not video_id:
        return None, None
    
    # Get video title using yt-dlp
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'user_agent': YDL_OPTS['user_agent'],
            'extractor_retries': YDL_OPTS['extractor_retries'],
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', f'Video {video_id}')
            return video_id, title
            
    except Exception as e:
        print(f"Warning: Could not fetch video title: {e}")
        return video_id, f'Video {video_id}'

def download_audio(url, video_id):
    """Download audio from YouTube video"""
    try:
        # Clean up any existing audio files first to prevent confusion
        cleanup_audio_files(video_id)
        
        # Try multiple format configurations for better compatibility
        format_options = [
            'bestaudio/best[height<=480]/worst',  # Primary option
            'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',  # Specific audio formats
            'best[height<=360]/worst',  # Lower quality fallback
            'worst'  # Last resort
        ]
        
        for i, format_option in enumerate(format_options):
            try:
                ydl_opts = YDL_OPTS.copy()
                ydl_opts['outtmpl'] = f'{video_id}.%(ext)s'
                ydl_opts['format'] = format_option
                
                print(f"📥 Downloading audio for video ID: {video_id} (attempt {i+1})")
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
                break  # Success, exit the loop
                
            except Exception as format_error:
                print(f"Format '{format_option}' failed: {format_error}")
                if i == len(format_options) - 1:  # Last attempt
                    raise format_error
                continue
        
        # Find downloaded file
        patterns = [f'{video_id}.*', f'{video_id}.*.m4a', f'{video_id}.*.webm', f'{video_id}.*.mp3', f'{video_id}.*.mp4']
        
        for pattern in patterns:
            matching_files = glob.glob(pattern)
            if matching_files:
                audio_file = matching_files[0]
                print(f"✅ Audio file downloaded successfully: {audio_file}")
                return audio_file
        
        print("❌ No audio file found with video ID pattern")
        return None
    
    except Exception as e:
        print(f"❌ Error downloading audio: {e}")
        return None

def load_audio_with_ffmpeg(audio_file):
    """Load audio using ffmpeg and return numpy array"""
    cmd = [
        FFMPEG_PATH,
        '-i', audio_file,
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-loglevel', 'quiet',
        'pipe:1'
    ]
    
    result = subprocess.run(cmd, capture_output=True, check=True)
    
    # Convert bytes to numpy array
    audio_data = np.frombuffer(result.stdout, dtype=np.int16)
    audio_data = audio_data.astype(np.float32) / 32768.0
    return audio_data

def transcribe_audio(audio_file):
    """Transcribe audio using pre-loaded Whisper model with GPU acceleration"""
    try:
        if not os.path.exists(audio_file):
            print(f"❌ Audio file not found: {audio_file}")
            return None
        
        # Get the pre-loaded Whisper model (loads once, reuses many times)
        print("🤖 Using pre-loaded Whisper model...")
        model = get_whisper_model()
        
        # Load audio and transcribe
        audio_data = load_audio_with_ffmpeg(audio_file)
        
        print("🎵 Transcribing audio data...")
        # Add parameters to ensure fresh transcription with GPU optimization
        result = model.transcribe(
            audio_data, 
            fp16=torch.cuda.is_available(),  # Use fp16 only if CUDA is available
            verbose=False,
            temperature=0.0,
            no_speech_threshold=0.6
        )
        
        print("✅ Transcription completed successfully!")
        return result["text"]
    
    except Exception as e:
        print(f"❌ Error transcribing audio: {e}")
        import traceback
        traceback.print_exc()
        return None

def cleanup_audio_files(video_id):
    """Clean up any audio files that might be left over"""
    try:
        audio_extensions = ['*.m4a', '*.webm', '*.mp3', '*.mp4', '*.wav']
        for ext in audio_extensions:
            files = glob.glob(ext)
            for file in files:
                # Remove ALL audio files to prevent cross-contamination
                if os.path.exists(file):
                    try:
                        os.remove(file)
                    except Exception as e:
                        print(f"Could not remove {file}: {e}")
    except Exception as e:
        print(f"Error during cleanup: {e}")

def get_transcript_with_whisper(url, video_id, status_callback=None):
    """Get transcript using Whisper speech-to-text"""
    try:
        if status_callback:
            status_callback('Downloading audio from YouTube...')
        print("📥 Downloading audio from YouTube...")
        audio_file = download_audio(url, video_id)
        
        if not audio_file:
            print("❌ Failed to download audio file")
            return None
        
        if status_callback:
            status_callback('Audio downloaded, starting transcription...')
        print("🎤 Transcribing audio with Whisper...")
        transcript = transcribe_audio(audio_file)
        
        if status_callback:
            status_callback('Transcription completed, cleaning up...')
        
        # Clean up audio file
        if os.path.exists(audio_file):
            print(f"🧹 Cleaning up audio file: {audio_file}")
            os.remove(audio_file)
        
        # Clean up any other audio files
        cleanup_audio_files(video_id)
        
        return transcript
    
    except Exception as e:
        print(f"❌ Error in speech-to-text process: {e}")
        return None

def summarize_with_gemini(transcript, video_title=""):
    """Use Google Gemini API to summarize the transcript"""
    try:
        if not GEMINI_API_KEY:
            print("❌ GEMINI_API_KEY not found in environment variables")
            return None
        
        print("🔑 Connecting to Google Gemini API...")
        
        # Configure Gemini
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
        
        print("📝 Creating optimized summary prompt...")
        
        prompt = f"""Summarize this YouTube video transcript concisely.

Title: {video_title}

{transcript}

Format:
**Summary (Video Title):**
**Key Points:**
**Main Takeaway:**

Summary should be 2-3 sentences.
Replace the video title with the actual video title.
Key Points should be 3-5 bullets.
Main Takeaway should be 1 sentence.
Focus on the most important information only."""
        
        print(f"🤖 Generating summary with Gemini model ({GEMINI_MODEL})...")
        
        # Generate content with Gemini
        response = model.generate_content(prompt)
        
        if response and response.text:
            return response.text.strip()
        else:
            print("❌ Empty response from Gemini API")
            return None
    
    except Exception as e:
        print(f"❌ Error generating summary with Gemini: {e}")
        return None

def main():
    """Main function for command-line usage"""
    print("YouTube Video Summarizer using Speech-to-Text + Gemini")
    print("=" * 60)
    
    if not GEMINI_API_KEY:
        print("❌ GEMINI_API_KEY not found in environment variables")
        print("Please set your Gemini API key in the .env file")
        return
    
    while True:
        video_url = input("\nEnter YouTube video URL (or 'quit' to exit): ").strip()
        
        if video_url.lower() == 'quit':
            break
        
        if not video_url:
            print("Please enter a valid YouTube URL.")
            continue
        
        video_id, video_title = get_video_info(video_url)
        if not video_id:
            print("Could not extract video ID from URL. Please check the URL and try again.")
            continue
            
        print(f"Processing video ID: {video_id}")
        print(f"Video Title: {video_title}")
        
        print("Using speech-to-text to transcribe video...")
        transcript = get_transcript_with_whisper(video_url, video_id)
        
        if not transcript:
            print("Could not transcribe the video. Please check the URL and try again.")
            continue
        
        print(f"Transcript length: {len(transcript)} characters")
        
        print("Generating summary with Gemini...")
        summary = summarize_with_gemini(transcript, video_title)
        
        if summary:
            print("\n" + "=" * 60)
            print("SUMMARY")
            print("=" * 60)
            print(summary)
            print("=" * 60)
            
            save = input("\nSave summary to file? (y/n): ").strip().lower()
            if save == 'y':
                filename = f"summary_{video_id}.txt"
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(f"Video ID: {video_id}\n")
                    f.write(f"Video Title: {video_title}\n")
                    f.write(f"Transcript Length: {len(transcript)} characters\n")
                    f.write("\n" + "=" * 60 + "\n")
                    f.write("SUMMARY\n")
                    f.write("=" * 60 + "\n")
                    f.write(summary)
                    f.write("\n" + "=" * 60 + "\n")
                    f.write("TRANSCRIPT\n")
                    f.write("=" * 60 + "\n")
                    f.write(transcript)
                print(f"Summary saved to {filename}")
        else:
            print("Failed to generate summary.")

if __name__ == "__main__":
    main()
