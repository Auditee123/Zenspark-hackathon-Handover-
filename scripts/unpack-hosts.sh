#!/usr/bin/env bash
# Recreate the three AgentMesh agent hosts from the ZIPs exported by the Builder (Deploy -> Download ZIP).
#
#   scripts/unpack-hosts.sh [ZIP_DIR]      default ZIP_DIR: inputs/zips
#
# Each host lands in agentmesh/hosts/<agent>/ (gitignored: the export carries private platform URLs).
# Re-running after a new export replaces the code and definition but keeps each host's .env, .venv and .local.
# A new .env is made from .env.example with this host's PORT, AUTH_MODE=dev and the three AZURE_* identity
# lines uncommented and empty, for you to paste. This script never prints .env contents.
set -euo pipefail
cd "$(dirname "$0")/.."

ZIP_DIR="${1:-inputs/zips}"
HOSTS_DIR="agentmesh/hosts"
AGENTS=("handover-orchestrator:8001" "handover-qa:8002" "handover-kt-session:8003")

mkdir -p "$HOSTS_DIR"
for entry in "${AGENTS[@]}"; do
  agent="${entry%%:*}"
  port="${entry##*:}"
  zip="$ZIP_DIR/$agent.zip"
  [ -f "$zip" ] || { echo "Missing $zip" >&2; exit 1; }

  tmp=$(mktemp -d)
  unzip -q "$zip" -d "$tmp"
  [ -d "$tmp/$agent" ] || { echo "$zip has no top folder $agent/" >&2; rm -rf "$tmp"; exit 1; }

  dest="$HOSTS_DIR/$agent"
  mkdir -p "$dest"
  # Replace exported files; keep local state and settings.
  rsync -a --delete --exclude '.env' --exclude '.venv/' --exclude '.local/' "$tmp/$agent/" "$dest/"
  rm -rf "$tmp"
  chmod +x "$dest/startup.sh"

  if [ -f "$dest/.env" ]; then
    echo "$agent: code updated from $zip; kept existing .env (port $(grep -E '^PORT=' "$dest/.env" | cut -d= -f2))"
  else
    sed -E \
      -e "s/^PORT=.*/PORT=$port/" \
      -e 's/^AUTH_MODE=.*/AUTH_MODE=dev/' \
      -e 's/^#(AZURE_TENANT_ID=)$/\1/' \
      -e 's/^#(AZURE_CLIENT_ID=)$/\1/' \
      -e 's/^#(AZURE_CLIENT_SECRET=)$/\1/' \
      "$dest/.env.example" > "$dest/.env"
    chmod 600 "$dest/.env"
    echo "$agent: unpacked from $zip; created .env (PORT=$port, AUTH_MODE=dev, AZURE_* lines ready to fill)"
  fi
done
