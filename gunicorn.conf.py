#!/usr/bin/env python3
"""
Gunicorn configuration for YouTube Summarizer production deployment
"""

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = 2
worker_class = "sync"
worker_connections = 1000
timeout = 300  # 5 minutes for video processing
keepalive = 2
max_requests = 1000
max_requests_jitter = 50

# Restart workers after this many requests to prevent memory leaks
preload_app = True

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "youtube-summarizer"

# Server mechanics
daemon = False
pidfile = None
user = None
group = None
tmp_upload_dir = None

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
