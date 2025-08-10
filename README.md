# 🎥 YouTube Video Summarizer

A powerful Chrome extension that automatically summarizes YouTube videos using AI (Whisper + Gemini). Downloads video audio, transcribes it with Whisper, and generates concise summaries using Google's Gemini API.

## 📁 Project Structure

```
youtube_summary/
├── chrome_extension/          # 🎯 Chrome extension files
│   ├── manifest.json         # Extension configuration
│   ├── popup.html           # Extension UI
│   ├── popup.js             # UI functionality
│   ├── content.js           # YouTube page integration
│   ├── background.js        # Backend communication
│   ├── icons/               # Extension icons
│   └── README.md            # Extension setup guide
├── server.py                # 🚀 Flask backend server
├── summarize_youtube_gemini.py # 🤖 Core AI logic (Whisper + Gemini)
├── requirements_server.txt  # 📦 Python dependencies
├── Dockerfile              # 🐳 Docker configuration
├── docker-compose.yml      # 🐳 Docker Compose setup
└── README.md               # 📖 This file
```

## 🚀 Quick Start

### 1. Get Gemini API Key

First, get your Gemini API key from Google:

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (you'll need it for the next step)

**📝 Note:** The Gemini API is free for most use cases with generous quotas.

### 2. Setup Environment Variables
```bash
# Option 1: Use the setup script (recommended)
python setup_env.py

# Option 2: Manual setup
# Create .env file with Gemini configuration
echo "GEMINI_API_KEY=your_api_key_here" > .env
echo "GEMINI_MODEL=gemini-2.0-flash-exp" >> .env
```

### 3. Start Server with Docker
```bash
# Build and start the server
docker compose up -d

# Check if it's running
curl http://localhost:5000/health
```



### 4. Install Chrome Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome_extension` folder from this project
5. The extension icon should appear in your toolbar

### 5. Use the Extension
1. Go to any YouTube video
2. Click the extension icon in your toolbar
3. Click "Generate Summary"
4. Wait for the AI to process the video
5. Read your summary! 🎉

## 🐳 Docker Commands

### YouTube Summarizer Server
```bash
# Start the server
docker compose up -d

# Stop the server
docker compose down

# View logs
docker compose logs -f

# Restart the server
docker compose restart

# Rebuild after changes
docker compose up -d --build

# Check server status
curl http://localhost:5000/health
```



## ✨ Features

- **One-click summarization** - No URL copying needed
- **Auto video detection** - Works on any YouTube page
- **AI-powered summaries** - Whisper + Gemini
- **Beautiful UI** - Modern, intuitive interface
- **Docker deployment** - Easy setup and management
- **Real-time progress** - See processing status
- **Automatic cleanup** - No leftover audio files
- **Copy & Save** - Easy sharing of summaries

## 🔧 Requirements

- **Docker Desktop** - For running the server
- **Chrome browser** - For the extension
- **Gemini API Key** - For AI summarization (free tier available)

## 🛠️ Development

### **Backend:** Flask server with async processing
### **Frontend:** Chrome extension with modern UI
### **AI:** Whisper for transcription, Gemini for summarization
### **Deployment:** Docker containerization

## 🔧 Troubleshooting

### **Server not starting:**
```bash
# Check if port 5000 is available
netstat -an | findstr :5000

# Check Docker logs
docker compose logs
```

### **Chrome extension can't connect:**
1. Verify server is running: `http://localhost:5000/health`
2. Check if Docker container is up: `docker compose ps`
3. Restart the container: `docker compose restart`

### **Gemini API connection issues:**
1. Make sure your API key is correct in the `.env` file
2. Check if you have sufficient API quota: [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Verify the model name is correct (default: `gemini-2.0-flash-exp`)
4. Test your API key manually: `python -c "import google.generativeai as genai; genai.configure(api_key='your_key'); print('Valid')"`

### **Audio download issues:**
- The server automatically handles YouTube's anti-bot measures
- Uses multiple retry strategies and user agent spoofing
- Falls back to alternative audio formats if needed

### **Extension not detecting videos:**
1. Make sure you're on a YouTube video page (URL contains `/watch`)
2. Refresh the page and try again
3. Check Chrome's developer console for errors

## 📖 Documentation

- **Extension Setup**: See `chrome_extension/README.md`
- **Docker Setup**: See `docker-compose.yml`

## 🔒 Security

- **API-based processing** - AI summarization happens via Google's secure Gemini API
- **Secure API calls** - All requests use HTTPS with your API key
- **CORS enabled** - Safe cross-origin requests
- **Automatic cleanup** - No sensitive data left behind
- **⚠️ Important:** Keep your `.env` file secure and never commit it to version control

## 🎯 How It Works

1. **Video Detection** - Extension detects YouTube video on current page
2. **Audio Download** - Server downloads video audio using yt-dlp
3. **Transcription** - Whisper AI converts audio to text
4. **Summarization** - Gemini AI creates concise summary
5. **Display** - Results shown in extension popup

## 📝 License

This project is for educational and personal use.

---

**Enjoy your AI-powered YouTube summaries! 🎉**
