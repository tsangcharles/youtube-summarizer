#!/usr/bin/env python3
"""
Setup script for YouTube Summarizer
Helps users create their .env file with the required Qwen3 configuration.
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
    
    print("\n🤖 This application uses Ollama for local AI processing.")
    print("🔗 Make sure you have Ollama running: https://ollama.ai")
    print("💡 No API keys needed - everything runs locally!\n")
    
    # Get Ollama configuration from user
    print("Ollama Configuration:")
    qwen_url = input("Enter Ollama base URL (default: http://localhost:11434): ").strip()
    if not qwen_url:
        qwen_url = "http://localhost:11434"
    
    qwen_model = input("Enter Qwen3 model name (default: qwen3:0.6b): ").strip()
    if not qwen_model:
        qwen_model = "qwen3:0.6b"
    
    # Create .env file
    try:
        with open('.env', 'w') as f:
            f.write(f"# Ollama Configuration\n")
            f.write(f"QWEN_BASE_URL={qwen_url}\n")
            f.write(f"QWEN_MODEL={qwen_model}\n")
            f.write(f"\n# Alternative for non-host networking:\n")
            f.write(f"# QWEN_BASE_URL=http://host.docker.internal:11434\n")
        
        print("\n✅ .env file created successfully!")
        print("🔒 Your Qwen3 configuration is now stored in the .env file")
        print("📋 The .env file can be safely committed since it contains no sensitive data")
        
        # Test the setup
        print("\n🧪 Testing Ollama connection...")
        os.environ['QWEN_BASE_URL'] = qwen_url
        os.environ['QWEN_MODEL'] = qwen_model
        
        try:
            import requests
            response = requests.get(f"{qwen_url}/api/tags", timeout=5)
            if response.status_code == 200:
                print("✅ Ollama connection test passed!")
                models = response.json().get('models', [])
                model_names = [model['name'] for model in models]
                if qwen_model in model_names:
                    print(f"✅ Model '{qwen_model}' is available!")
                else:
                    print(f"⚠️  Model '{qwen_model}' not found. Available models: {', '.join(model_names)}")
                    print(f"💡 Run: docker exec ollama ollama pull {qwen_model}")
            else:
                print("❌ Ollama connection test failed!")
                print("💡 Make sure Ollama is running: docker run -d -p 11434:11434 ollama/ollama")
        except Exception as e:
            print(f"❌ Connection test failed: {e}")
            print("💡 Make sure Ollama is running: docker run -d -p 11434:11434 ollama/ollama")
        
        print("\n🚀 Setup complete! You can now run the application.")
        print("📖 Run 'python summarize_youtube_qwen.py' to test the summarizer")
        print("🐳 Or run 'docker-compose up' to start the server")
        
    except Exception as e:
        print(f"❌ Error creating .env file: {e}")
        return

if __name__ == "__main__":
    main()