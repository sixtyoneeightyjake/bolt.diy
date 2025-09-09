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

# Prefer .env then override with .env.local by ordering (later wins)
append_env_file .env || true
append_env_file .env.local || true

if [ -z "${bindings}" ]; then
  # Fallback to current environment for variables declared in worker-configuration.d.ts
  while IFS= read -r varname; do
    # Safely expand env var by name
    val=$(eval "printf '%s' \"\
\${$varname:-}\"")
    if [ -n "${val}" ]; then
      bindings+=" --binding ${varname}=${val}"
    fi
  done < <(extract_env_vars)
fi

# Trim leading space
bindings="${bindings# }"
echo "${bindings}"
