#!/usr/bin/env python3
"""
Setup script for YouTube Summarizer
Helps users create their .env file with the required API key.
"""

import os
import sys

def main():
    print("🔧 YouTube Summarizer Environment Setup")
    print("=" * 50)
    
    # Check if .env already exists
    if os.path.exists('.env'):
        print("⚠️  .env file already exists!")
        overwrite = input("Do you want to overwrite it? (y/n): ").strip().lower()
        if overwrite != 'y':
            print("Setup cancelled.")
            return
    
    print("\n📝 You need a Gemini API key from Google AI Studio.")
    print("🔗 Get your free API key at: https://makersuite.google.com/app/apikey")
    print("💡 The free tier includes 15 requests per minute.\n")
    
    # Get API key from user
    api_key = input("Enter your Gemini API key: ").strip()
    
    if not api_key:
        print("❌ API key is required!")
        return
    
    if not api_key.startswith('AIza'):
        print("⚠️  Warning: Gemini API keys typically start with 'AIza'. Please verify your key.")
        continue_anyway = input("Continue anyway? (y/n): ").strip().lower()
        if continue_anyway != 'y':
            return
    
    # Create .env file
    try:
        with open('.env', 'w') as f:
            f.write(f"GEMINI_API_KEY={api_key}\n")
        
        print("\n✅ .env file created successfully!")
        print("🔒 Your API key is now stored securely in the .env file")
        print("📋 The .env file is ignored by git to keep your key private")
        
        # Test the setup
        print("\n🧪 Testing setup...")
        os.environ['GEMINI_API_KEY'] = api_key
        
        try:
            from summarize_youtube_gemini import GEMINI_API_KEY
            print("✅ API key configuration test passed!")
        except Exception as e:
            print(f"❌ Configuration test failed: {e}")
            return
        
        print("\n🚀 Setup complete! You can now run the application.")
        print("📖 Run 'python summarize_youtube_gemini.py' to test the summarizer")
        print("🐳 Or run 'docker-compose up' to start the server")
        
    except Exception as e:
        print(f"❌ Error creating .env file: {e}")
        return

if __name__ == "__main__":
    main()
