#!/usr/bin/env python3
"""
Test script to validate the fixes for YouTube Summarizer
"""

import sys
import os
import time
import subprocess
import requests
import json
from urllib.parse import quote

# Test video URLs for different scenarios
TEST_VIDEOS = {
    'short_public': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  # Rick Roll - short, public
    'medium_public': 'https://www.youtube.com/watch?v=9bZkp7q19f0',  # Gangnam Style - medium, public
    'tech_talk': 'https://www.youtube.com/watch?v=8pTEmbeENF4',  # TED talk - good for testing
}

API_BASE_URL = 'http://localhost:5000'

def test_server_health():
    """Test if the server is running and healthy"""
    print("🔍 Testing server health...")
    try:
        response = requests.get(f'{API_BASE_URL}/health', timeout=10)
        if response.status_code == 200:
            print("✅ Server is healthy and running")
            return True
        else:
            print(f"❌ Server health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Server is not responding: {e}")
        return False

def test_video_extraction(video_url):
    """Test video information extraction"""
    print(f"🔍 Testing video extraction for: {video_url}")
    
    # Import the function to test locally
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    try:
        from summarize_youtube_gemini import get_video_info
        
        video_id, title = get_video_info(video_url)
        if video_id and title:
            print(f"✅ Video extraction successful: {video_id} - {title[:50]}...")
            return True
        else:
            print("❌ Video extraction failed")
            return False
    except Exception as e:
        print(f"❌ Video extraction error: {e}")
        return False

def test_audio_download(video_url):
    """Test audio download functionality"""
    print(f"🔍 Testing audio download for: {video_url}")
    
    try:
        from summarize_youtube_gemini import get_video_info, download_audio
        
        video_id, title = get_video_info(video_url)
        if not video_id:
            print("❌ Cannot test audio download - video ID extraction failed")
            return False
        
        print(f"📥 Attempting to download audio for video: {video_id}")
        audio_file = download_audio(video_url, video_id)
        
        if audio_file and os.path.exists(audio_file):
            file_size = os.path.getsize(audio_file)
            print(f"✅ Audio download successful: {audio_file} ({file_size} bytes)")
            
            # Clean up
            try:
                os.remove(audio_file)
                print("🧹 Cleaned up audio file")
            except:
                pass
            
            return True
        else:
            print("❌ Audio download failed")
            return False
    except Exception as e:
        print(f"❌ Audio download error: {e}")
        return False

def test_whisper_transcription():
    """Test Whisper model loading"""
    print("🔍 Testing Whisper model initialization...")
    
    try:
        from summarize_youtube_gemini import initialize_whisper_model
        
        model = initialize_whisper_model("base")
        if model:
            print("✅ Whisper model loaded successfully")
            return True
        else:
            print("❌ Whisper model loading failed")
            return False
    except Exception as e:
        print(f"❌ Whisper model error: {e}")
        return False

def test_api_endpoint(video_url):
    """Test the API endpoint"""
    print(f"🔍 Testing API endpoint with: {video_url}")
    
    try:
        payload = {
            'video_url': video_url,
            'video_title': 'Test Video'
        }
        
        response = requests.post(
            f'{API_BASE_URL}/summarize-sync',
            json=payload,
            timeout=120  # 2 minutes timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success') and result.get('summary'):
                print(f"✅ API endpoint successful: {len(result['summary'])} character summary")
                print(f"📝 Summary preview: {result['summary'][:100]}...")
                return True
            else:
                print(f"❌ API endpoint failed: {result}")
                return False
        else:
            error_data = response.json() if response.content else {}
            print(f"❌ API endpoint error {response.status_code}: {error_data}")
            return False
    except Exception as e:
        print(f"❌ API endpoint error: {e}")
        return False

def check_dependencies():
    """Check if all required dependencies are installed"""
    print("🔍 Checking dependencies...")
    
    required_packages = [
        'flask',
        'flask_cors',
        'yt_dlp',
        'whisper',
        'torch',
        'numpy',
        'google.generativeai'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
            print(f"✅ {package} is installed")
        except ImportError:
            print(f"❌ {package} is missing")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n❌ Missing packages: {', '.join(missing_packages)}")
        print("💡 Install missing packages with: pip install " + " ".join(missing_packages))
        return False
    
    return True

def check_environment():
    """Check environment variables"""
    print("🔍 Checking environment variables...")
    
    env_file = '.env'
    if os.path.exists(env_file):
        print("✅ .env file found")
        
        # Read env file
        with open(env_file, 'r') as f:
            content = f.read()
            if 'GEMINI_API_KEY=' in content and not content.count('GEMINI_API_KEY=your_gemini_api_key_here'):
                print("✅ GEMINI_API_KEY appears to be set")
                return True
            else:
                print("❌ GEMINI_API_KEY is not properly set in .env file")
                return False
    else:
        print("❌ .env file not found")
        print("💡 Create .env file with GEMINI_API_KEY=your_actual_api_key")
        return False

def run_comprehensive_test():
    """Run all tests"""
    print("🚀 Running comprehensive test suite for YouTube Summarizer fixes\n")
    
    tests = [
        ("Dependencies", check_dependencies),
        ("Environment", check_environment),
        ("Server Health", test_server_health),
        ("Whisper Model", test_whisper_transcription),
    ]
    
    # Add video-specific tests
    for name, url in TEST_VIDEOS.items():
        tests.append((f"Video Extraction ({name})", lambda u=url: test_video_extraction(u)))
        tests.append((f"Audio Download ({name})", lambda u=url: test_audio_download(u)))
    
    # Add API tests (only if server is healthy)
    if test_server_health():
        for name, url in TEST_VIDEOS.items():
            tests.append((f"API Endpoint ({name})", lambda u=url: test_api_endpoint(u)))
    
    results = {}
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        print(f"Testing: {test_name}")
        print('='*50)
        
        try:
            result = test_func()
            results[test_name] = result
            if result:
                passed += 1
        except Exception as e:
            print(f"❌ Test {test_name} crashed: {e}")
            results[test_name] = False
    
    # Summary
    print(f"\n{'='*50}")
    print("TEST SUMMARY")
    print('='*50)
    print(f"Passed: {passed}/{total} tests")
    print(f"Success rate: {(passed/total)*100:.1f}%")
    
    print("\nDetailed Results:")
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
    
    if passed == total:
        print("\n🎉 All tests passed! The fixes are working correctly.")
    elif passed >= total * 0.8:
        print("\n✅ Most tests passed. Minor issues may remain.")
    else:
        print("\n❌ Multiple tests failed. Please check the issues above.")
    
    return results

if __name__ == "__main__":
    print("YouTube Summarizer - Fix Validation Test")
    print("=" * 50)
    
    # Change to script directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    results = run_comprehensive_test()
    
    # Exit with appropriate code
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    if passed == total:
        sys.exit(0)  # All tests passed
    else:
        sys.exit(1)  # Some tests failed
