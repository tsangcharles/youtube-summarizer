# 🎥 YouTube Video Summarizer

A powerful Chrome extension that automatically summarizes YouTube videos using AI (Whisper + Llama). Downloads video audio, transcribes it with Whisper, and generates concise summaries using Ollama's Llama models.

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
├── summarize_youtube_llama.py # 🤖 Core AI logic (Whisper + Llama)
├── requirements_server.txt  # 📦 Python dependencies
├── Dockerfile              # 🐳 Docker configuration
├── docker-compose.yml      # 🐳 Docker Compose setup
└── README.md               # 📖 This file
```

## 🚀 Quick Start

### 1. Setup Ollama Docker Container

First, run the Ollama Docker container:

```bash
# For CPU-only setup:
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# For NVIDIA GPU setup:
docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

Next, download the Llama model (this runs in the background):

```bash
# Download and setup the llama3.2:1b model
docker exec ollama ollama pull llama3.2:1b
```

**📝 Note:** The model download happens automatically and the container runs in the background. No need for interactive terminal sessions.

### 2. Setup Environment Variables
```bash
# Option 1: Use the setup script (recommended)
python setup_env.py

# Option 2: Manual setup
# Create .env file with Ollama configuration
echo "LLAMA_BASE_URL=http://localhost:11434" > .env
echo "LLAMA_MODEL=llama3.2:1b" >> .env
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

### Ollama Container Management
```bash
# Check if Ollama is running
docker ps | grep ollama

# Start Ollama container (if stopped)
docker start ollama

# Stop Ollama container
docker stop ollama

# View available models
docker exec ollama ollama list

# Download additional models
docker exec ollama ollama pull llama3.2:3b

# Test Ollama API
curl http://localhost:11434/api/tags
```

## ✨ Features

- **One-click summarization** - No URL copying needed
- **Auto video detection** - Works on any YouTube page
- **AI-powered summaries** - Whisper + Llama
- **Beautiful UI** - Modern, intuitive interface
- **Docker deployment** - Easy setup and management
- **Real-time progress** - See processing status
- **Automatic cleanup** - No leftover audio files
- **Copy & Save** - Easy sharing of summaries

## 🔧 Requirements

- **Docker Desktop** - For running Ollama and the server
- **Chrome browser** - For the extension
- **Ollama** - For running Llama models locally

## 🛠️ Development

### **Backend:** Flask server with async processing
### **Frontend:** Chrome extension with modern UI
### **AI:** Whisper for transcription, Llama for summarization
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

### **Ollama connection issues:**
1. Make sure Ollama container is running: `docker ps | grep ollama`
2. Check if Ollama is accessible: `curl http://localhost:11434/api/tags`
3. Verify the model is downloaded: `docker exec ollama ollama list`
4. Check your `.env` file has correct LLAMA_BASE_URL and LLAMA_MODEL

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

- **Local processing** - All AI inference happens locally with Ollama
- **No external API calls** - Everything runs on your machine
- **CORS enabled** - Safe cross-origin requests
- **Automatic cleanup** - No sensitive data left behind

## 🎯 How It Works

1. **Video Detection** - Extension detects YouTube video on current page
2. **Audio Download** - Server downloads video audio using yt-dlp
3. **Transcription** - Whisper AI converts audio to text
4. **Summarization** - Llama AI creates concise summary
5. **Display** - Results shown in extension popup

## 📝 License

This project is for educational and personal use.

---

**Enjoy your AI-powered YouTube summaries! 🎉**
