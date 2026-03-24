#!/bin/sh
set -e

# Generate runtime config for the browser.
# PROXY_URL: base URL of the CORS proxy (e.g. https://proxy.example.com:8081).
# Leave empty to use same-origin routing (requires nginx proxy_pass setup).
cat > /usr/share/nginx/html/config.js <<EOF
window.__ENV__ = {
  PROXY_URL: "${PROXY_URL:-}"
};
EOF

exec nginx -g 'daemon off;'
