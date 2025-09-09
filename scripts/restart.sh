#!/usr/bin/env bash

# Simple restart helper for the Bolt.diy service
# - Restarts the systemd unit
# - Shows latest logs for quick verification

set -euo pipefail

SERVICE_NAME=${SERVICE_NAME:-bolt-diy}
LOG_LINES=${LOG_LINES:-80}

echo "🔄 Restarting service: $SERVICE_NAME"
if systemctl is-active --quiet "$SERVICE_NAME"; then
  sudo systemctl restart "$SERVICE_NAME"
else
  echo "Service not active. Starting instead."
  sudo systemctl start "$SERVICE_NAME"
fi

echo "✅ Service restarted. Status:"
systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,60p'

echo "📜 Tailing last $LOG_LINES log lines (Ctrl+C to exit)"
sudo journalctl -u "$SERVICE_NAME" -n "$LOG_LINES" -f

