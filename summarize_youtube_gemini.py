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
import google.generativeai as genai
import yt_dlp
import whisper
from urllib.parse import urlparse, parse_qs

# Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required. Please set it in your .env file.")

# FFmpeg path for Docker environment
FFMPEG_PATH = "ffmpeg"

# YouTube URL patterns
YOUTUBE_PATTERNS = [
    r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
    r'youtube\.com\/watch\?.*v=([^&\n?#]+)'
]

# yt-dlp configuration
YDL_OPTS = {
    'format': 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    'user_agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'extractor_retries': 3,
    'retries': 3,
}

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
        ydl_opts = YDL_OPTS.copy()
        ydl_opts['outtmpl'] = f'{video_id}.%(ext)s'
        
        print(f"📥 Downloading audio for video ID: {video_id}")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # Find downloaded file
        patterns = [f'{video_id}.*', f'{video_id}.*.m4a', f'{video_id}.*.webm', f'{video_id}.*.mp3', f'{video_id}.*.mp4']
        
        for pattern in patterns:
            matching_files = glob.glob(pattern)
            if matching_files:
                audio_file = matching_files[0]
                print(f"✅ Audio file downloaded successfully: {audio_file}")
                return audio_file
        
        # Fallback: find most recent audio file
        print("🔍 No audio file found with video ID pattern, searching for recent audio files...")
        all_audio_files = glob.glob("*.m4a") + glob.glob("*.webm") + glob.glob("*.mp3") + glob.glob("*.mp4")
        if all_audio_files:
            latest_file = max(all_audio_files, key=os.path.getmtime)
            print(f"✅ Found recent audio file: {latest_file}")
            return latest_file
        
        print("❌ No audio file found after download")
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
    
    print(f"🔧 Loading audio: {audio_file}")
    result = subprocess.run(cmd, capture_output=True, check=True)
    
    # Convert bytes to numpy array
    audio_data = np.frombuffer(result.stdout, dtype=np.int16)
    audio_data = audio_data.astype(np.float32) / 32768.0
    
    print(f"✅ Audio loaded successfully: {len(audio_data)} samples")
    return audio_data

def transcribe_audio(audio_file):
    """Transcribe audio using Whisper"""
    try:
        if not os.path.exists(audio_file):
            print(f"❌ Audio file not found: {audio_file}")
            return None
        
        file_size = os.path.getsize(audio_file)
        print(f"📁 Audio file found: {audio_file} (size: {file_size} bytes)")
        
        # Load Whisper model
        print("🤖 Loading Whisper model...")
        model = whisper.load_model("tiny")
        
        # Load audio and transcribe
        audio_data = load_audio_with_ffmpeg(audio_file)
        
        print("🎵 Transcribing audio data...")
        result = model.transcribe(audio_data, fp16=False, verbose=True)
        
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
                if video_id not in file and os.path.exists(file):
                    try:
                        print(f"Cleaning up leftover audio file: {file}")
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
    """Use Gemini to summarize the transcript"""
    try:
        print("🔑 Configuring Gemini AI...")
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        print("📝 Creating summary prompt...")
        prompt = f"""
        Create a brief, concise summary of this YouTube video transcript.
        
        Video Title: {video_title}
        
        Transcript:
        {transcript}
        
        Provide a summary in this format:
        
        **Summary:** (2-3 sentences max)
        
        **Key Points:** (3-5 bullet points)
        
        **Main Takeaway:** (1 sentence)
        
        Keep it short and to the point. Focus on the most important information only.
        """
        
        print("🤖 Generating summary with Gemini AI...")
        response = model.generate_content(prompt)
        print("✅ Summary generated successfully!")
        return response.text
    
    except Exception as e:
        print(f"❌ Error generating summary: {e}")
        return None

def main():
    """Main function for command-line usage"""
    print("YouTube Video Summarizer using Speech-to-Text + Gemini")
    print("=" * 60)
    
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
