#!/usr/bin/env bash
set -euo pipefail

bindings=""

# Function to extract variable names from the TypeScript interface
extract_env_vars() {
  grep -o '[A-Z_]\+:' worker-configuration.d.ts | sed 's/://'
}

declare -A KV

# Load key=value pairs from a file into KV (skip comments, trim quotes)
load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    local name value
    name="${line%%=*}"
    value="${line#*=}"
    # strip surrounding quotes if present
    value="$(echo "$value" | sed 's/^"\(.*\)"$/\1/')"
    # only set if value is non-empty
    if [[ -n "$name" && -n "$value" ]]; then
      KV["$name"]="$value"
    fi
  done <"$f"
}

# Precedence: .env then .env.local overrides (only non-empty)
load_env_file .env
load_env_file .env.local

if (( ${#KV[@]} > 0 )); then
  for k in "${!KV[@]}"; do
    bindings+="--binding ${k}=${KV[$k]} "
  done
else
  # Fallback to current environment for variables declared in worker-configuration.d.ts
  env_vars=( $(extract_env_vars) )
  for var in "${env_vars[@]}"; do
    if [[ -n "${!var:-}" ]]; then
      bindings+="--binding ${var}=${!var} "
    fi
  done
fi

bindings="$(echo $bindings | sed 's/[[:space:]]*$//')"
echo "$bindings"
