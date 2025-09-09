#!/usr/bin/env bash
set -euo pipefail

bindings=""

# Function to extract variable names from the TypeScript interface
extract_env_vars() {
  grep -o '[A-Z_]\+:' worker-configuration.d.ts | sed 's/://'
}

# Append bindings from an env file (non-empty, non-comment lines)
append_env_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    # skip blanks and comments
    case "$line" in
      ''|'#'*) continue ;;
    esac
    local name value
    name="${line%%=*}"
    value="${line#*=}"
    # strip surrounding matching quotes if present
    case "$value" in
      \"*\") value=${value#\"}; value=${value%\"} ;;
      \'*\') value=${value#\'}; value=${value%\'} ;;
    esac
    if [ -n "$name" ] && [ -n "$value" ]; then
      bindings+=" --binding ${name}=${value}"
    fi
  done <"$f"
}

# Prefer .env.production, then .env, then override with .env.local by ordering (later wins)
append_env_file .env.production || true
append_env_file .env || true
append_env_file .env.local || true

# Always ensure critical runtime variables from current environment are added
# 1) Variables declared in worker-configuration.d.ts
while IFS= read -r varname; do
  val=$(eval "printf '%s' \"\
\${$varname:-}\"")
  if [ -n "${val}" ]; then
    bindings+=" --binding ${varname}=${val}"
  fi
done < <(extract_env_vars)

# 2) Auth and client config commonly needed at runtime
for varname in \
  CLERK_PUBLISHABLE_KEY \
  CLERK_SECRET_KEY \
  VITE_CLERK_SIGN_IN_URL \
  VITE_CLERK_SIGN_UP_URL \
  VITE_GITHUB_ACCESS_TOKEN \
  VITE_GITHUB_TOKEN_TYPE \
  VITE_LOG_LEVEL \
  CONTEXT7_API_KEY \
  EXA_API_KEY
do
  val=$(eval "printf '%s' \"\
\${$varname:-}\"")
  if [ -n "${val}" ]; then
    bindings+=" --binding ${varname}=${val}"
  fi
done

# Trim leading space
bindings="${bindings# }"
echo "${bindings}"
