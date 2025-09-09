#!/usr/bin/env bash
set -euo pipefail

# Path-of-least-resistance origin setup: nginx (80/443) + Let's Encrypt (webroot)
# + systemd service that runs your app on port 5173 via `pnpm run start:prod`.
#
# Defaults (override by exporting before running or passing inline):
#   DOMAIN=mojocode.sixtyoneeighty.com APP_DIR=/root/bolt.diy APP_PORT=5173 EMAIL=admin@mojocode.sixtyoneeighty.com
# Example:
#   DOMAIN=example.com APP_DIR=/root/bolt.diy EMAIL=you@example.com bash scripts/setup-origin.sh

DOMAIN=${DOMAIN:-mojocode.sixtyoneeighty.com}
APP_DIR=${APP_DIR:-/root/bolt.diy}
APP_PORT=${APP_PORT:-5173}
EMAIL=${EMAIL:-admin@mojocode.sixtyoneeighty.com}

NGINX_SITE=/etc/nginx/sites-available/bolt
NGINX_SITE_LINK=/etc/nginx/sites-enabled/bolt
CERTBOT_WEBROOT=/var/www/certbot
SERVICE_NAME=bolt

need_cmd() { command -v "$1" >/dev/null 2>&1; }

echo "==> Validating environment (must run as root)"
if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must be run as root (sudo)." >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "APP_DIR does not exist: ${APP_DIR}" >&2
  exit 1
fi

echo "==> Detecting package manager"
PKG=""
if need_cmd apt-get; then
  PKG=apt
elif need_cmd yum; then
  PKG=yum
elif need_cmd dnf; then
  PKG=dnf
else
  echo "No supported package manager (apt, yum, dnf) found." >&2
  exit 1
fi

echo "==> Installing dependencies (nginx, certbot)"
if [[ "$PKG" == apt ]]; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
else
  # RHEL-based: enable EPEL if needed
  if [[ "$PKG" == dnf ]]; then
    dnf install -y epel-release || true
    dnf install -y nginx certbot python3-certbot-nginx || dnf install -y certbot python3-certbot-nginx
  else
    yum install -y epel-release || true
    yum install -y nginx certbot python3-certbot-nginx || yum install -y certbot python3-certbot-nginx
  fi
  systemctl enable --now nginx
fi

echo "==> Ensuring webroot for ACME challenges exists"
mkdir -p "${CERTBOT_WEBROOT}"
chown -R www-data:www-data "${CERTBOT_WEBROOT}" 2>/dev/null || true

echo "==> Writing initial HTTP-only nginx site (to allow certificate issuance)"
cat >"${NGINX_SITE}" <<HTTP_ONLY
server {
    listen 80;
    server_name ${DOMAIN};

    # ACME HTTP-01 challenge endpoint for certbot webroot
    location /.well-known/acme-challenge/ {
        root ${CERTBOT_WEBROOT};
        try_files \$uri =404;
    }

    # Temporary proxy to the app during certificate issuance
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    client_max_body_size 25m;
}
HTTP_ONLY

echo "==> Enabling nginx site"
mkdir -p /etc/nginx/sites-enabled /etc/nginx/sites-available 2>/dev/null || true
ln -sf "${NGINX_SITE}" "${NGINX_SITE_LINK}"
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo "==> Testing and reloading nginx"
nginx -t
systemctl reload nginx || systemctl restart nginx

echo "==> Obtaining Let's Encrypt certificate for ${DOMAIN} (webroot)"
certbot certonly \
  --webroot -w "${CERTBOT_WEBROOT}" \
  -d "${DOMAIN}" \
  --agree-tos --no-eff-email -m "${EMAIL}" \
  --non-interactive || {
  echo "Certbot failed. Ensure DNS for ${DOMAIN} points to this server and port 80 is accessible." >&2
  exit 1
}

echo "==> Writing final HTTPS nginx site (HTTP -> HTTPS redirect + proxy to app)"
cat >"${NGINX_SITE}" <<HTTPS_CFG
# HTTP: only ACME and redirect to HTTPS
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${CERTBOT_WEBROOT};
        try_files \$uri =404;
    }

    location / { return 301 https://\$host\$request_uri; }
}

# HTTPS: terminate TLS and proxy to the app on ${APP_PORT}
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        # Critical headers to prevent redirect loops
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Server \$host;

        # Rewrite any absolute http:// redirects from upstream to https://
        proxy_redirect http:// https://;

        # WebSocket + long-lived connections
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
    }

    client_max_body_size 25m;
}
HTTPS_CFG

echo "==> Testing and reloading nginx (final HTTPS config)"
nginx -t
systemctl reload nginx

echo "==> Resolving absolute path to pnpm for systemd unit"
PNPM_BIN=$(command -v pnpm || true)
if [[ -z "${PNPM_BIN}" ]]; then
  echo "pnpm is not in PATH. Install it (e.g., corepack enable; corepack prepare pnpm@latest --activate) and re-run." >&2
  exit 1
fi

# Ensure Node is available to systemd (nvm installs are not on PATH by default under systemd)
NODE_BIN=$(command -v node || true)
if [[ -z "${NODE_BIN}" ]]; then
  # Try to infer node bin dir from pnpm location
  NODE_DIR="$(dirname "${PNPM_BIN}")"
  NODE_BIN_CANDIDATE="${NODE_DIR}/node"
  if [[ -x "${NODE_BIN_CANDIDATE}" ]]; then
    NODE_BIN="${NODE_BIN_CANDIDATE}"
  fi
fi
NODE_DIR="$(dirname "${NODE_BIN}")"
if [[ -z "${NODE_DIR}" || ! -x "${NODE_BIN}" ]]; then
  echo "Could not locate a usable node binary for systemd. Add Node to PATH or install a system node." >&2
  exit 1
fi

echo "==> Creating systemd service: ${SERVICE_NAME}.service"
cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Bolt.diy app
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
# Ensure node from nvm is available when using pnpm shim
Environment=PATH=${NODE_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Optional: load secrets if present
EnvironmentFile=-${APP_DIR}/.env
EnvironmentFile=-${APP_DIR}/.env.local
ExecStartPre=${PNPM_BIN} install --no-frozen-lockfile --prod=false
ExecStartPre=${PNPM_BIN} run build
ExecStart=${PNPM_BIN} run start:prod
Restart=always
RestartSec=3
TimeoutStartSec=600
TimeoutStopSec=30
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Enabling and starting ${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"

echo "==> Status (tail)"
systemctl --no-pager -l status "${SERVICE_NAME}.service" || true
journalctl -u "${SERVICE_NAME}.service" -n 50 --no-pager || true

echo "\nAll set. Point your DNS A record for ${DOMAIN} directly to this server (DNS-only, no proxy)."
echo "Then visit: https://${DOMAIN}"
