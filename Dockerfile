FROM node:18-slim

# Install dependencies for Chromium and Playwright
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Install Playwright with Chromium
RUN npx playwright install chromium --with-deps

# Copy application files
COPY . ./

# Create directories
RUN mkdir -p /app/screenshots /app/test-recordings

# Start script with Xvfb for headed browser support
RUN echo '#!/bin/bash\n\
# Start Xvfb for headed browser support\n\
Xvfb :99 -screen 0 1920x1080x24 &\n\
export DISPLAY=:99\n\
\n\
echo "🚀 Visual Test Automation Platform Starting..."\n\
echo "📍 Access at: http://localhost:8284"\n\
\n\
# Start the application\n\
node server.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE 8284

# Start the application
CMD ["/app/start.sh"]