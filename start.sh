#!/bin/bash
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
sleep 2

fluxbox &
sleep 2

x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -ncache 10 -ncache_cr -forever &
sleep 2

/opt/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6086 &

echo "🚀 Visual Test Automation Platform Starting..."
echo "📍 Web Interface: http://localhost:8288"
echo "🖥️  VNC Viewer: http://localhost:6086/vnc.html"
echo ""
echo "Open http://localhost:6086/vnc.html to see the browser automation in action!"

# Start the server with correct environment variables
export RUNNING_IN_DOCKER=true
cd /app
node server-working.js &
SERVER_PID=$!

# Keep container running
echo "Container is running. Press Ctrl+C to stop..."
tail -f /dev/null
