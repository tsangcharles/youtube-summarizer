FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

# Set environment variables to prevent Python cache files
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements_server.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements_server.txt

# Copy application files
COPY server.py .
COPY summarize_youtube_gemini.py .
COPY gunicorn.conf.py .

# Create temp directory for audio files
RUN mkdir -p /app/temp

# Create a non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Run the application with Gunicorn
CMD ["gunicorn", "--config", "gunicorn.conf.py", "server:app"]
