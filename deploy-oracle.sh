#!/bin/bash

# Oracle Cloud Deployment Script for VIA Platform
# This script will be run on the Oracle Cloud instance after SSH

echo "🚀 Deploying VIA Platform on Oracle Cloud..."

# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "📦 Installing Docker..."
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=arm64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER

# Install Docker Compose
echo "📦 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo apt-get install -y git

# Clone repository
echo "📥 Cloning repository..."
git clone https://github.com/midhunp1/visual-intelligent-automation.git
cd visual-intelligent-automation

# Build and run Docker container
echo "🔨 Building Docker container..."
sudo docker build -t via-platform .

# Run the container
echo "🚀 Starting VIA Platform..."
sudo docker run -d \
  --name via-platform \
  -p 8288:8288 \
  -p 6086:6086 \
  -e DISPLAY=:99 \
  -e RUNNING_IN_DOCKER=true \
  -e NODE_ENV=production \
  --restart unless-stopped \
  via-platform

# Set up firewall rules
echo "🔧 Configuring firewall..."
sudo iptables -I INPUT -p tcp --dport 8288 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 6086 -j ACCEPT
sudo netfilter-persistent save

# Show status
echo ""
echo "✅ Deployment complete!"
echo "📍 Web Interface: http://YOUR_ORACLE_IP:8288"
echo "🖥️  VNC Viewer: http://YOUR_ORACLE_IP:6086/vnc.html"
echo ""
echo "Run 'sudo docker logs via-platform' to check logs"