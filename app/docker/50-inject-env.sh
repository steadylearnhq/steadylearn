#!/bin/sh
# Replaces the __VITE_*__ placeholders the image was built with by the values
# of the same-named environment variables. Unset variables become empty.
set -eu

html=/usr/share/nginx/html

for name in \
  VITE_API_URL \
  VITE_USER_POOL_ID \
  VITE_USER_POOL_CLIENT_ID \
  VITE_USER_POOL_DOMAIN \
  VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN \
  VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT
do
  value=$(printenv "$name" || true)
  [ -n "$value" ] || echo "$0: warning: $name is not set" >&2
  # Escape the characters sed treats specially in a replacement.
  escaped=$(printf '%s' "$value" | sed 's/[\\&|]/\\&/g')
  find "$html" -type f \( -name '*.js' -o -name '*.html' \) \
    -exec sed -i "s|__${name}__|${escaped}|g" {} +
done
