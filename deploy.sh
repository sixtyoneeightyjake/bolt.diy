#!/bin/bash

# Bolt.diy Production Deployment Script (without Docker)
# Run this script on your server

set -e

echo "🚀 Starting Bolt.diy deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# Check if domain is provided
DOMAIN=${1:-mojocode.sixtyoneeighty.com}
echo -e "${YELLOW}Using domain: $DOMAIN${NC}"

# Install dependencies if needed
echo -e "${YELLOW}Installing system dependencies...${NC}"
apt update
apt install -y nginx certbot python3-certbot-nginx curl

# Install Node.js and pnpm if not installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
fi

# Install application dependencies
echo -e "${YELLOW}Installing application dependencies...${NC}"
pnpm install

# Build the application
echo -e "${YELLOW}Building application...${NC}"
pnpm run build

# Setup nginx configuration
echo -e "${YELLOW}Setting up nginx configuration...${NC}"
cp nginx-direct.conf /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Create certbot webroot directory
mkdir -p /var/www/certbot

# Test nginx configuration
nginx -t

# Restart nginx
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}✓ Nginx configured and started${NC}"

# Setup SSL certificates
echo -e "${YELLOW}Setting up SSL certificates...${NC}"
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Update nginx config to use HTTPS
echo -e "${YELLOW}Updating nginx configuration for HTTPS...${NC}"
sed -i 's/^    # location \/ {/    location \/ {/' /etc/nginx/sites-available/$DOMAIN
sed -i 's/^    #     return 301/        return 301/' /etc/nginx/sites-available/$DOMAIN
sed -i 's/^    # }/    }/' /etc/nginx/sites-available/$DOMAIN

# Uncomment HTTPS server block
sed -i 's/^# server {/server {/' /etc/nginx/sites-available/$DOMAIN
sed -i 's/^#     /    /' /etc/nginx/sites-available/$DOMAIN
sed -i 's/^# }/}/' /etc/nginx/sites-available/$DOMAIN

# Comment out temporary HTTP proxy
sed -i 's/^    # Temporary: proxy to app/    # Temporary: proxy to app (DISABLED after SSL)/' /etc/nginx/sites-available/$DOMAIN
sed -i '/# Temporary: proxy to app (DISABLED after SSL)/,/client_max_body_size 25m;/s/^    /    # /' /etc/nginx/sites-available/$DOMAIN

nginx -t && systemctl reload nginx

echo -e "${GREEN}✓ SSL certificates installed and nginx updated${NC}"

# Create or update systemd service for the application
echo -e "${YELLOW}Configuring systemd service...${NC}"
cat > /etc/systemd/system/bolt-diy.service << EOF
[Unit]
Description=Bolt.diy Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=5173

[Install]
WantedBy=multi-user.target
EOF

# Start and enable (or restart) the service
systemctl daemon-reload
systemctl enable bolt-diy || true
if systemctl is-active --quiet bolt-diy; then
  echo -e "${YELLOW}Restarting existing bolt-diy service to pick up new build...${NC}"
  systemctl restart bolt-diy
else
  echo -e "${YELLOW}Starting bolt-diy service...${NC}"
  systemctl start bolt-diy
fi

echo -e "${GREEN}✓ Application service is running${NC}"

# Setup automatic certificate renewal
echo -e "${YELLOW}Setting up automatic certificate renewal...${NC}"
(crontab -l 2>/dev/null; echo "0 2 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}Your application should now be available at: https://$DOMAIN${NC}"
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  Check app status: systemctl status bolt-diy"
echo -e "  View app logs: journalctl -u bolt-diy -f"
echo -e "  Restart app: systemctl restart bolt-diy"
echo -e "  Check nginx status: systemctl status nginx"
echo -e "  Test nginx config: nginx -t"
