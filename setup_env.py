#!/usr/bin/env python3
"""
Setup script for YouTube Summarizer
Helps users create their .env file with the required Gemini API configuration.
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
    
    print("\n🤖 This application uses Google Gemini API for AI processing.")
    print("🔗 Get your API key from: https://makersuite.google.com/app/apikey")
    print("💡 You'll need a Gemini API key to use this application.\n")
    
    # Get Gemini configuration from user
    print("Gemini API Configuration:")
    gemini_api_key = input("Enter your Gemini API key: ").strip()
    if not gemini_api_key:
        print("❌ Gemini API key is required!")
        return
    
    gemini_model = input("Enter Gemini model name (default: gemini-2.0-flash-exp): ").strip()
    if not gemini_model:
        gemini_model = "gemini-2.0-flash-exp"
    
    # Create .env file
    try:
        with open('.env', 'w') as f:
            f.write(f"# Gemini API Configuration\n")
            f.write(f"GEMINI_API_KEY={gemini_api_key}\n")
            f.write(f"GEMINI_MODEL={gemini_model}\n")
        
        print("\n✅ .env file created successfully!")
        print("🔒 Your Gemini API configuration is now stored in the .env file")
        print("⚠️  WARNING: The .env file contains your API key - DO NOT commit it to version control!")
        
        # Test the setup
        print("\n🧪 Testing Gemini API connection...")
        os.environ['GEMINI_API_KEY'] = gemini_api_key
        os.environ['GEMINI_MODEL'] = gemini_model
        
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel(gemini_model)
            
            # Test with a simple prompt
            response = model.generate_content("Hello, this is a test.")
            if response and response.text:
                print("✅ Gemini API connection test passed!")
                print(f"✅ Model '{gemini_model}' is working!")
            else:
                print("❌ Gemini API test failed - no response received")
        except Exception as e:
            print(f"❌ Gemini API test failed: {e}")
            print("💡 Please check your API key and try again")
        
        print("\n🚀 Setup complete! You can now run the application.")
        print("📖 Run 'python summarize_youtube_gemini.py' to test the summarizer")
        print("🐳 Or run 'docker-compose up' to start the server")
        
    except Exception as e:
        print(f"❌ Error creating .env file: {e}")
        return

if __name__ == "__main__":
    main()